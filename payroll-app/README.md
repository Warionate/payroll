# 個人指導塾 給与計算アプリ

個人指導塾の講師向け給与計算・スケジュール管理システム。
複雑な給与体系（授業給・授業間手当・昇給）に対応し、日々の勤務記録から正確な給与を自動計算します。

## 機能

- **給与計算**: 授業給・生徒数・規定外給・各種手当を考慮した自動計算・リアルタイム見積もり
- **給与調整**: インセンティブや計算誤差修正の追加、最終金額からの差額自動計算
- **スケジュール管理**: カレンダー形式でのシフト管理、Google/Apple カレンダー連携 (iCal)
- **お知らせ配信**: 管理者から全ユーザーへの一斉送信、起動時ポップアップ、プッシュ通知連動
- **帳票出力**: 給与明細の CSV ダウンロード・PDF 印刷（調整額反映）
- **マルチデバイス**: PWA 対応、PC/スマホ両対応、ダークモード、オフライン閲覧

## 技術スタック

| 区分           | 技術                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Frontend       | React 19, Vite 8, Tailwind CSS 4, TanStack Query 5                     |
| Routing        | React Router 8                                                         |
| Backend        | Node.js, Express 5, better-sqlite3, Drizzle ORM                        |
| Shared         | `@payroll/shared` — 型定義・Zod スキーマ・ユーティリティ・定数         |
| Monorepo       | npm workspaces (`packages/shared`, `server`, `client`)                 |
| Validation     | Zod (サーバー/クライアント共通)                                        |
| Security       | JWT 二層認証, AES-256-GCM 暗号化, BCrypt, Helmet, Rate Limiting        |
| Testing        | Vitest (239 server + 116 client + 28 shared), Playwright (3 E2E specs) |
| Logging        | Winston (ファイルローテーション, Request ID トレーシング)              |
| API Docs       | OpenAPI 3.0 自動生成 (`/api-docs`、開発環境のみ)                       |
| CI/CD          | GitHub Actions                                                         |
| Infrastructure | PM2, Cloudflare Tunnel, Cloudflare Worker（メンテ時フォールバック）    |

## クイックスタート

### 前提条件

- Node.js v22（`engines` で `>=22 <23` を要求）
- npm v9 以上

### セットアップ（初回のみ）

```bash
# 依存関係のインストール（全ワークスペース一括）
npm install

# 環境変数を設定
cp .env.example .env
# .env を開き ENCRYPTION_KEY と JWT_SECRET を設定

# 管理者アカウントの作成
cd server
node tools/reset_admin.cjs admin <パスワード>
cd ..
```

> [!IMPORTANT]
> `ENCRYPTION_KEY` は一度設定したら変更しないこと。変更すると既存の暗号化データが復号できなくなります。

### 開発サーバー起動

```bash
# Terminal 1: サーバー（localhost:4001）
npm run dev --workspace=server

# Terminal 2: クライアント（localhost:4000）
npm run dev --workspace=client
```

クライアントの `/api` プロキシはサーバー (port 4001) に自動転送されます。

### 主要コマンド

| コマンド                         | 説明                              |
| -------------------------------- | --------------------------------- |
| `npm run dev --workspace=server` | サーバー起動（tsx watch）         |
| `npm run dev --workspace=client` | クライアント起動（Vite）          |
| `npm run build`                  | 全体ビルド（shared → client）     |
| `npm run test --workspaces`      | 全テスト実行                      |
| `npm run lint --workspaces`      | ESLint（全ワークスペース）        |
| `npm run typecheck --workspaces` | 型チェック（全ワークスペース）    |
| `npm run format`                 | Prettier 自動整形                 |
| `npm run format:check`           | Prettier チェック（CI 用）        |
| `npm run bump -- patch`          | バージョン一括更新（patch/minor） |

## プロジェクト構成

```text
payroll-app/
├── packages/shared/         # @payroll/shared — 共有パッケージ
│   └── src/
│       ├── types/           # 共有型定義
│       ├── schemas/         # Zod バリデーションスキーマ
│       ├── utils/           # 共有ユーティリティ（salaryCalc 等）
│       └── constants/       # 共有定数（給与期間、デフォルト単価）
├── server/                  # Express 5 バックエンド
│   └── src/
│       ├── controllers/     # HTTP リクエスト/レスポンス処理
│       ├── services/        # ビジネスロジック
│       ├── repositories/    # DB アクセス（Drizzle ORM）
│       ├── middleware/      # 認証・バリデーション・エラーハンドリング
│       └── routes/          # URL マッピング
├── client/                  # React 19 + Vite フロントエンド
│   └── src/
│       ├── api/             # API クライアント（12 ドメインモジュール）
│       ├── components/      # UI コンポーネント
│       ├── pages/           # ページコンポーネント
│       ├── hooks/           # カスタムフック
│       └── utils/           # クライアントユーティリティ
└── package.json             # ルート（npm workspaces 定義）
```

## ドキュメント

| ドキュメント                             | 内容                                            |
| ---------------------------------------- | ----------------------------------------------- |
| [USAGE.md](./USAGE.md)                   | エンドユーザー向け操作ガイド                    |
| [client/TESTING.md](./client/TESTING.md) | フロントエンドテストガイド                      |
| [worker/README.md](./worker/README.md)   | Cloudflare Worker（メンテナンスフォールバック） |

### 関連リポジトリ

- **[payroll-status](../payroll-status)** — ステータスページ / Discord Bot / ヘルスチェック常駐サーバー。`payroll-status.warionate.com` で公開。Cloudflare Worker はこのサーバーの `/api/maintenance-status` を参照してメンテ判定を行う。本リポジトリの外（別サーバー `payroll-status` に PM2 で常駐）。

---

&copy; 2025-2026 Warionate.
