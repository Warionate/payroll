# Payroll Status

payroll.warionate.com のサービス稼働状況を公開するステータスページ。
payroll-app の障害監視と、Cloudflare Worker が参照するメンテナンスフラグも持つ。

- **公開URL**: https://payroll-status.warionate.com
- **対象サービス**: https://payroll.warionate.com

## 機能

- **自動障害検知**: `/healthz` を30秒間隔で監視し、3回連続の失敗でダウン、2回連続の成功で復旧と判定
  - 対照 URL（Cloudflare）にも届かないときは監視側のネットワーク不調とみなし、失敗に数えない
  - メンテナンス中の停止は障害として投稿しない（Discord に「計画停止を検知」とだけ通知）
- **ステータスフィード**: Markdown 対応の投稿を表示。メンテ予告は状態「予定」で投稿する
- **自動リダイレクト**: 通常時は payroll.warionate.com へ転送し、障害・メンテ中だけフィードを表示
- **Discord Bot**: スラッシュコマンドで投稿・更新・解決・メンテ切り替え
- **Discord Webhook**: 障害/復旧・メンテ開始/終了・監視の再開を通知
- **管理画面**: Cloudflare Access (Google ログイン) で保護
- **死活監視**: payroll-app 側の Cloudflare Worker が Cron で `/api/maintenance-status` の `lastCheckAt` を見て、この監視自体が止まっていたら通知する

## 技術スタック

| 技術 | 用途 |
|------|------|
| Node.js 22 + Express 5 | バックエンド |
| SQLite (better-sqlite3 12.x) + Drizzle ORM | データベース |
| Vanilla HTML/CSS/JS | フロントエンド |
| discord.js | Discord Bot |
| setInterval | ヘルスチェック定期実行 |
| PM2 | プロセス管理 |
| Cloudflare Tunnel | 公開 |

## セットアップ

### 1. ローカル開発

```bash
cp .env.example .env
# .env を編集（Discord関連は空でもOK）
npm install
npm run dev
```

http://localhost:4002 でアクセス。
管理画面は http://localhost:4002/admin 。`.env` の `NODE_ENV=development` と `ADMIN_DEV_BYPASS=true` がそろっているときだけ、localhost から直接開いた場合に限り Cloudflare Access なしで入れる。

### 2. Discord Bot の準備

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成
2. **Bot** タブ → **Reset Token** → トークンをコピー → `.env` の `DISCORD_BOT_TOKEN` に設定
3. Bot の **Privileged Gateway Intents** は不要（スラッシュコマンドのみ使用）
4. **OAuth2 → URL Generator** で以下のスコープを選択：
   - `bot`
   - `applications.commands`
5. Bot Permissions:
   - Send Messages
6. 生成されたURLでBotをサーバーに招待
7. サーバーIDとあなたのユーザーIDを `.env` に設定：
   - `DISCORD_GUILD_ID`: サーバーID（サーバーを右クリック → IDをコピー）
   - `DISCORD_OWNER_ID`: ユーザーID（ユーザー設定 → 詳細 → 開発者モード ON → 自分を右クリック → IDをコピー）

### 3. Discord Webhook の準備

1. Discord の通知先チャンネルで **チャンネルの編集 → 連携サービス → ウェブフック → 新しいウェブフック**
2. Webhook URL をコピー → `.env` の `DISCORD_WEBHOOK_URL` に設定

### 4. 本番デプロイ 

```bash
# SSH でサーバーに接続（Windows からは PowerShell の ssh を使う）
ssh <user>@<status-server>

# スワップ設定 (1GB RAM のため推奨)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# リポジトリ clone
cd ~
git clone git@github.com:Warionate/payroll.git
cd payroll/payroll-status

# セットアップ
npm ci
npm run build
cp .env.example .env
nano .env  # 各値を設定。NODE_ENV=production にし、ADMIN_DEV_BYPASS は消す

# PM2 で起動（必ず ecosystem ファイル経由で。NODE_ENV=production が付く）
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
# 表示されたコマンドを実行

# 週次バックアップ（OS TZ = UTC。毎週月曜 05:00 JST）
crontab -e
```

### 5. Cloudflare Tunnel

トンネル（`c475f112-2441-4299-9cd3-c5740ba5d215`）は **Cloudflare 側で集中管理**しているので、
ホスト上の `config.yml` ではなくダッシュボード（または API）の ingress を編集する：

```yaml
ingress:
  - hostname: payroll-status.warionate.com
    service: http://localhost:4002
  - service: http_status:404
```

Cloudflare DNS に `payroll-status.warionate.com` の CNAME（→ `<tunnel-id>.cfargotunnel.com`、proxied）を追加。

## 更新手順

```bash
ssh <user>@<status-server>
cd ~/payroll-status
./server-deploy.sh
```

`server-deploy.sh` は次の順に実行する。途中で失敗したら Discord に通知して止まる。

1. 追跡中のファイルに変更があれば中止（サーバー上の手修正を消さない）
2. `origin/main` へ fast-forward（できなければ中止）
3. `npm ci`
4. DB スナップショットを `backups/pre-deploy/` に保存（直近 5 世代）
5. 別ディレクトリにビルドしてから `dist` を差し替え
6. `pm2 restart` → `/api/status` で起動確認

## Discord スラッシュコマンド

| コマンド | 説明 |
|----------|------|
| `/post <type> <title> <content> [status]` | 新規投稿。メンテ予告は status に「予定」を指定 |
| `/update <id> <content> [status]` | 投稿の本文・状態を更新 |
| `/resolve [id] [message]` | 障害を解決済みにしてリダイレクトを再開。ID 省略で最新の未解決の障害。message を指定すると「復旧」を投稿 |
| `/toggle` | リダイレクト ON/OFF |
| `/maintenance [mode]` | メンテナンスモード ON/OFF（mode 省略でトグル） |
| `/check` | 現在のステータス確認 |

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `NODE_ENV` | ✅ | 本番は `production`（未設定も production 扱い） |
| `PORT` | × | サーバーポート (default: 4002) |
| `PAYROLL_URL` | ✅ | 監視対象URL |
| `HEALTH_CHECK_INTERVAL_MS` | × | チェック間隔 (default: 30000) |
| `HEALTH_CHECK_TIMEOUT_MS` | × | 1回のチェックのタイムアウト (default: 10000) |
| `HEALTH_CHECK_RETRIES` | × | 1回のチェック内の即時リトライ回数 (default: 2) |
| `HEALTH_CHECK_RETRY_DELAY_MS` | × | リトライ間隔 (default: 2000) |
| `CONSECUTIVE_FAILURES_THRESHOLD` | × | ダウン判定の連続失敗回数 (default: 3) |
| `RECOVERY_SUCCESS_THRESHOLD` | × | 復旧判定の連続成功回数 (default: 2) |
| `HEALTH_CHECK_CONTROL_URL` | × | 監視側ネットワーク不調の切り分け用 URL。空で無効 (default: Cloudflare の trace) |
| `DISCORD_BOT_TOKEN` | × | Discord Bot トークン |
| `DISCORD_GUILD_ID` | × | Discord サーバーID |
| `DISCORD_OWNER_ID` | × | 管理者のDiscord User ID |
| `DISCORD_WEBHOOK_URL` | × | 通知用 Webhook URL |
| `REDIRECT_URL` | ✅ | リダイレクト先URL |
| `CF_ACCESS_TEAM_DOMAIN` | ✅ | Cloudflare Access チームドメイン (例: `xxx.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | ✅ | Access Application の AUD タグ |
| `ADMIN_DEV_BYPASS` | × | 開発時のみ `true`。本番には置かない |

---

© 2026 Warionate.
