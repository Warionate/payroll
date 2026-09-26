/**
 * OpenAPI spec generated from Zod schemas via @asteasolutions/zod-to-openapi.
 *
 * Replaces the old swagger-jsdoc approach (which had no route annotations).
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import {
  loginSchema,
  ratesSchema,
  salaryAdjustmentSchema,
  updatePasswordSchema,
} from '@payroll/shared';
import {
  workLogValidation,
  workLogBulkSaveValidation,
  workLogStatusValidation,
  patternValidation,
  slotValidation,
  bulkSlotValidation,
  patternAssignmentValidation,
  chatMessageValidation,
  chatRoomValidation,
  broadcastValidation,
  registerValidation,
} from './middleware/validate.js';

// Extend Zod with OpenAPI metadata
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ── Security scheme ────────────────────────────────────────────────

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'ログインで取得したJWTトークン',
});

function secured() {
  return [{ [bearerAuth.name]: [] }];
}

// ── Common schemas ─────────────────────────────────────────────────

const ErrorSchema = registry.register(
  'Error',
  z.object({
    error: z.string().describe('エラーメッセージ'),
    errorCode: z.number().int().optional().describe('エラーコード'),
    details: z.any().optional().describe('詳細情報'),
  }),
);

const IdParam = z.object({ id: z.coerce.number().int().min(1).describe('リソースID') });

// ── Auth ───────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: 'ログイン',
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: { description: 'ログイン成功' },
    401: { description: '認証失敗', content: { 'application/json': { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  summary: 'ユーザー登録',
  request: { body: { content: { 'application/json': { schema: registerValidation } } } },
  responses: {
    201: { description: '登録成功' },
    400: { description: 'バリデーションエラー' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags: ['Auth'],
  summary: 'ログアウト',
  security: secured(),
  responses: { 200: { description: 'ログアウト成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: ['Auth'],
  summary: 'トークンリフレッシュ',
  responses: {
    200: { description: '新しいトークン発行' },
    401: { description: 'リフレッシュトークンが無効' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  tags: ['Auth'],
  summary: '現在のユーザー情報取得',
  security: secured(),
  responses: { 200: { description: 'ユーザー情報' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/calendar_token',
  tags: ['Auth', 'Calendar'],
  summary: 'カレンダートークン取得',
  security: secured(),
  responses: { 200: { description: 'カレンダートークン' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/calendar_token/reset',
  tags: ['Auth', 'Calendar'],
  summary: 'カレンダートークンリセット',
  security: secured(),
  responses: { 200: { description: '新しいカレンダートークン' } },
});

// ── Users ──────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/users',
  tags: ['Users'],
  summary: '全ユーザー一覧（管理者のみ）',
  security: secured(),
  responses: { 200: { description: 'ユーザー一覧' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/users/{id}',
  tags: ['Users'],
  summary: 'ユーザー削除',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/users/{id}/profile',
  tags: ['Users'],
  summary: 'プロフィール更新',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/users/{id}/password',
  tags: ['Users'],
  summary: 'パスワード変更',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: updatePasswordSchema } } },
  },
  responses: { 200: { description: '変更成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/users/{id}/role',
  tags: ['Users'],
  summary: 'ロール変更（管理者のみ）',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '変更成功' } },
});

// ── Rates ──────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/rates',
  tags: ['Rates'],
  summary: '給与単価一覧',
  security: secured(),
  responses: { 200: { description: '単価一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/rates',
  tags: ['Rates'],
  summary: '給与単価作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: ratesSchema } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/rates/{id}',
  tags: ['Rates'],
  summary: '給与単価更新',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: ratesSchema } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/rates/{id}',
  tags: ['Rates'],
  summary: '給与単価削除',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

// ── Work Logs ──────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/work_logs',
  tags: ['Work Logs'],
  summary: '勤務記録一覧',
  security: secured(),
  responses: { 200: { description: '勤務記録一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/work_logs',
  tags: ['Work Logs'],
  summary: '勤務記録作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: workLogValidation } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/work_logs/{id}',
  tags: ['Work Logs'],
  summary: '勤務記録更新',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: workLogValidation } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/work_logs/{id}',
  tags: ['Work Logs'],
  summary: '勤務記録削除',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'patch',
  path: '/api/work_logs/{id}/status',
  tags: ['Work Logs'],
  summary: 'ステータス更新',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: workLogStatusValidation } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/work_logs/bulk_save',
  tags: ['Work Logs'],
  summary: '一括保存',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: workLogBulkSaveValidation } } } },
  responses: { 200: { description: '保存成功' } },
});

// ── Fixed Shifts ───────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/fixed_shifts',
  tags: ['Fixed Shifts'],
  summary: '固定シフト一覧',
  security: secured(),
  responses: { 200: { description: '固定シフト一覧' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/fixed_shifts/bulk',
  tags: ['Fixed Shifts'],
  summary: '固定シフト一括更新',
  security: secured(),
  responses: { 200: { description: '更新成功' } },
});

// ── Patterns ───────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/patterns',
  tags: ['Patterns'],
  summary: 'パターン一覧',
  security: secured(),
  responses: { 200: { description: 'パターン一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/patterns',
  tags: ['Patterns'],
  summary: 'パターン作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: patternValidation } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/patterns/{id}',
  tags: ['Patterns'],
  summary: 'パターン更新',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: patternValidation } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/patterns/{id}',
  tags: ['Patterns'],
  summary: 'パターン削除（管理者のみ）',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/slots',
  tags: ['Patterns'],
  summary: 'スロット作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: slotValidation } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/slots/bulk',
  tags: ['Patterns'],
  summary: 'スロット一括作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: bulkSlotValidation } } } },
  responses: { 200: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/slots/{id}',
  tags: ['Patterns'],
  summary: 'スロット更新',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/slots/{id}',
  tags: ['Patterns'],
  summary: 'スロット削除',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/pattern_assignments',
  tags: ['Patterns'],
  summary: 'パターン割り当て',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: patternAssignmentValidation } } } },
  responses: { 201: { description: '割り当て成功' } },
});

// ── Calendar ───────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/calendar/feed/{token}',
  tags: ['Calendar'],
  summary: 'iCalフィード取得',
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: { description: 'iCalデータ（text/calendar）' },
    404: { description: 'トークンが無効' },
  },
});

// ── Chat ───────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/chat/rooms',
  tags: ['Chat'],
  summary: 'チャットルーム一覧',
  security: secured(),
  responses: { 200: { description: 'ルーム一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/chat/rooms',
  tags: ['Chat'],
  summary: 'チャットルーム作成',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: chatRoomValidation } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/chat/rooms/{id}',
  tags: ['Chat'],
  summary: 'チャットルーム削除',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/chat/rooms/{id}/messages',
  tags: ['Chat'],
  summary: 'メッセージ一覧',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: 'メッセージ一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/chat/rooms/{id}/messages',
  tags: ['Chat'],
  summary: 'メッセージ送信',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: chatMessageValidation } } },
  },
  responses: { 201: { description: '送信成功' } },
});

// ── Broadcasts ─────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/chat/broadcasts',
  tags: ['Broadcasts'],
  summary: 'お知らせ一覧',
  security: secured(),
  responses: { 200: { description: 'お知らせ一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/chat/broadcasts',
  tags: ['Broadcasts'],
  summary: 'お知らせ作成（管理者のみ）',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: broadcastValidation } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/chat/broadcasts/{id}',
  tags: ['Broadcasts'],
  summary: 'お知らせ更新（管理者のみ）',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: broadcastValidation } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/chat/broadcasts/{id}',
  tags: ['Broadcasts'],
  summary: 'お知らせ削除（管理者のみ）',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/chat/broadcasts/{id}/read',
  tags: ['Broadcasts'],
  summary: 'お知らせ既読',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '既読成功' } },
});

// ── Salary Adjustments ─────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/salary_adjustments',
  tags: ['Salary Adjustments'],
  summary: '給与調整一覧',
  security: secured(),
  responses: { 200: { description: '給与調整一覧' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/salary_adjustments',
  tags: ['Salary Adjustments'],
  summary: '給与調整作成（管理者のみ）',
  security: secured(),
  request: { body: { content: { 'application/json': { schema: salaryAdjustmentSchema } } } },
  responses: { 201: { description: '作成成功' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/salary_adjustments/{id}',
  tags: ['Salary Adjustments'],
  summary: '給与調整更新（管理者のみ）',
  security: secured(),
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: salaryAdjustmentSchema } } },
  },
  responses: { 200: { description: '更新成功' } },
});

registry.registerPath({
  method: 'delete',
  path: '/api/salary_adjustments/{id}',
  tags: ['Salary Adjustments'],
  summary: '給与調整削除（管理者のみ）',
  security: secured(),
  request: { params: IdParam },
  responses: { 200: { description: '削除成功' } },
});

// ── Notifications ──────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/notifications/vapidPublicKey',
  tags: ['Notifications'],
  summary: 'VAPID公開鍵取得',
  security: secured(),
  responses: { 200: { description: 'VAPID公開鍵' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/notifications/subscribe',
  tags: ['Notifications'],
  summary: 'プッシュ通知購読',
  security: secured(),
  responses: { 201: { description: '購読成功' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/notifications/unsubscribe',
  tags: ['Notifications'],
  summary: 'プッシュ通知解除',
  security: secured(),
  responses: { 200: { description: '解除成功' } },
});

// ── Uploads ────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/api/uploads',
  tags: ['Uploads'],
  summary: 'ファイルアップロード',
  security: secured(),
  responses: { 201: { description: 'アップロード成功' } },
});

// ── PDF ────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/pdf/salary',
  tags: ['PDF'],
  summary: '給与明細PDF生成',
  security: secured(),
  responses: {
    200: { description: 'PDF (application/pdf)' },
  },
});

// ── Generate OpenAPI document ──────────────────────────────────────

const generator = new OpenApiGeneratorV3(registry.definitions);

export const specs = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: '給与計算アプリ API',
    version: '1.0.0',
    description: `
個人指導塾の講師向け給与計算・スケジュール管理システムのAPI仕様書です。

## 認証
ほとんどのエンドポイントはJWT認証が必要です。
ログイン後に取得したトークンを \`Authorization: Bearer <token>\` ヘッダーに設定してください。
Cookie-based JWTも使用されます。

## エラーレスポンス
すべてのエラーは以下の形式で返されます：
\`\`\`json
{
  "error": "エラーメッセージ",
  "errorCode": 1001,
  "details": {}
}
\`\`\`

## エラーコード
- **1xxx**: 認証エラー
- **2xxx**: 認可エラー
- **3xxx**: バリデーションエラー
- **4xxx**: リソースエラー
- **5xxx**: データベースエラー
- **7xxx**: レートリミットエラー
- **9xxx**: サーバーエラー
        `.trim(),
    contact: {
      name: 'Warionate',
      email: 'support@warionate.com',
    },
  },
  servers: [
    { url: 'http://localhost:4001', description: '開発サーバー' },
    { url: 'https://payroll.warionate.com', description: '本番サーバー' },
  ],
});

export const setupSwagger = (app: Express): void => {
  // Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: '給与計算アプリ API文書',
    }),
  );

  // JSON spec endpoint
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
