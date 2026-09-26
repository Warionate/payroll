# payroll-maintenance-shield

`payroll.warionate.com` の前段に置く Cloudflare Worker。

## 役割

1. payroll-status の `/api/maintenance-status` をポーリングして、
   - `maintenanceMode=true` ならメンテページ（「メンテナンス中」）を返す
   - `lastHealthStatus=down` なら障害ページ（「障害が発生しています」）を返す
   - `/api/*` は `X-Maintenance: 1` 付き JSON 503、document ナビゲーションは
     HTML 503、`/uploads` 等のサブリソースは素の 503 を返す
2. それ以外は origin にそのまま流す（5xx もそのまま通す）
3. origin が unreachable な時は、トップレベルの document ナビゲーションに
   限りメンテ HTML を返す。API / `/uploads` 等は素の 502 を返す
4. `/healthz`・`/api/admin/*`・`/api/auth/refresh` は常にパススルー
   （メンテが 15 分を超えても管理者がセッション更新して admin API を叩けるように）
5. メンテ HTML は 15 秒間隔で `/api/status` をポーリングし、`X-Maintenance` が
   外れたら自動リロードする（HTML 自体は `no-store`）。SW 登録済みクライアント
   向けの同等処理は `client/src/pages/MaintenancePage.tsx` にある
6. Cron（5 分ごと）で payroll-status 自体の死活を見る。`/api/maintenance-status` の
   `lastCheckAt` が 10 分より古い、または到達できないときは Discord に通知する
   （経過時間が分かるときは超えた直後 + 1 時間ごと、到達不能時は 30 分ごと）

## payroll-status の死活監視の通知先

通知先は Worker の secret に入れる（未設定ならログに出すだけで通知しない）。

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
# payroll-status の .env と同じ Webhook URL でよい
```

メンテ判定 JSON は Cloudflare の `caches.default` に `max-age=10` で保存する。
加えて同じ判定を 10 分 TTL のフォールバックエントリにも保存し、payroll-status に
到達できない間は直近の判定を使い続ける（メンテ中に payroll-status が落ちても
フェイルオープンしない。Cache API は colo 単位なのでベストエフォート）。
フォールバックも無い場合は origin へのパススルーにフォールバックする。

## CLI セットアップ

```bash
cd worker
npm install
```

初回のみログインが必要：

```bash
npx wrangler login
```

ブラウザが開くので OAuth で承認する。CI 等でブラウザを開けない場合は
`CLOUDFLARE_API_TOKEN` 環境変数で代替できる。

## デプロイ

```bash
npm run deploy
# = npx wrangler deploy
```

`wrangler.toml` の `routes` に従って `payroll.warionate.com/*` に
バインドされる。`zone_name` は登録済みゾーン名と一致している必要がある。

## 動作確認

```bash
# リアルタイムログ
npm run tail

# 手動でメンテ判定 JSON を見る
curl -s https://payroll-status.warionate.com/api/maintenance-status

# Worker 経由でレスポンスヘッダ確認
curl -sI https://payroll.warionate.com/
# 通常時: 200 OK (origin の応答)
# メンテ時: 503 + X-Maintenance-Origin-Status ヘッダあり
```

## 緊急時：Worker をバイパス

`wrangler.toml` の `[vars]` で `WORKER_BYPASS = "true"` にして再 deploy
すれば、判定をスキップして常に origin に流す。

```bash
# 一行で書き換えてデプロイしたい場合
sed -i 's/WORKER_BYPASS = "false"/WORKER_BYPASS = "true"/' wrangler.toml
npm run deploy
```

完全に Worker を外したい場合：

```bash
npx wrangler delete
```

## 開発

```bash
npm run dev          # ローカルで起動
npm run typecheck    # tsc --noEmit
```

`wrangler dev` はローカル URL を表示するので、そこに curl を叩いて挙動確認できる。

## メンテモードの切り替え方

メンテモードは payroll-status の DB フラグで制御する。

- 管理画面: `https://payroll-status.warionate.com/admin` → メンテナンスモード トグル
- Discord: `/maintenance mode:on` または `/maintenance mode:off`（`mode` 省略でトグル）

切り替え後、最大 10 秒で Worker のキャッシュが期限切れになり反映される。
ON/OFF の切り替えはステータスページのフィードにも自動で記録され、Discord にも通知される
（ON で「メンテナンス開始」投稿、OFF で進行中のメンテ投稿をすべて解決済みに更新。予定の投稿は残す）。

メンテ中に payroll-app を止めても障害としては投稿されない（Discord には「計画停止を検知」とだけ通知）。
メンテを終えても応答がなければ、その時点で障害として投稿・通知される。

解除後はメンテ画面を開いているクライアントが自動でリロードする。
SW 登録済みクライアントは Service Worker の更新（新バージョンの取得と
切り替え）まで済ませてからリロードするため、メンテ中に新バージョンを
デプロイしていれば解除と同時にバージョンアップが完了する。
