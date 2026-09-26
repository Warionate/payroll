/**
 * Drizzle ORM Schema - all database table definitions
 * Property names match DB column names (snake_case) for backward compatibility with services
 */
import { sqliteTable, text, integer, index, primaryKey, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 0. Users
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    password_hash: text('password_hash').notNull(),
    role: text('role').default('user'),
    calendar_token: text('calendar_token'),
    calendar_token_created_at: text('calendar_token_created_at'),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    // Authentik（OIDC）の sub。ログイン済みの本人が設定画面から連携したときだけ入る。
    // プロバイダの sub_mode は user_id なので、Authentik の利用者番号（pk）の文字列になる。
    oidc_sub: text('oidc_sub').unique(),
    // 確認済みのメールアドレス（小文字）。確認前のアドレスはここに入れず email_tokens に持つ。
    // パスワード再設定とログインに使う。Authentik との突き合わせには使わない
    email: text('email').unique(),
  },
  (table) => [index('idx_users_calendar_token').on(table.calendar_token)],
);

// 1. Rates (wage values are AES-256-CBC encrypted at service layer)
export const rates = sqliteTable(
  'rates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').references(() => users.id),
    start_date: text('start_date').notNull(),
    wage_1_student: text('wage_1_student'),
    wage_2_students: text('wage_2_students'),
    wage_3_students: text('wage_3_students'),
    wage_4_students: text('wage_4_students'),
    hourly_wage: text('hourly_wage'),
    allowance_day: text('allowance_day'),
    allowance_gap: text('allowance_gap'),
    is_active: integer('is_active').default(1),
  },
  (table) => [
    index('idx_rates_user_id').on(table.user_id),
    index('idx_rates_user_start').on(table.user_id, table.start_date),
  ],
);

// 2. Schedule Patterns
export const schedulePatterns = sqliteTable('schedule_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  is_default: integer('is_default').default(0),
  is_archived: integer('is_archived').default(0),
});

// 3. Schedule Slots
export const scheduleSlots = sqliteTable(
  'schedule_slots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pattern_id: integer('pattern_id').references(() => schedulePatterns.id),
    period_name: text('period_name'),
    start_time: text('start_time'),
    end_time: text('end_time'),
  },
  (table) => [index('idx_schedule_slots_pattern').on(table.pattern_id)],
);

// 4. Fixed Shifts
export const fixedShifts = sqliteTable(
  'fixed_shifts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').references(() => users.id),
    day_of_week: integer('day_of_week'),
    schedule_slot_id: integer('schedule_slot_id').references(() => scheduleSlots.id),
    student_count: text('student_count'),
  },
  (table) => [
    index('idx_fixed_shifts_user').on(table.user_id),
    index('idx_fixed_shifts_user_day').on(table.user_id, table.day_of_week),
  ],
);

// 5. Work Logs
export const workLogs = sqliteTable(
  'work_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').references(() => users.id),
    date: text('date').notNull(),
    work_type: text('work_type').notNull(),
    schedule_slot_id: integer('schedule_slot_id').references(() => scheduleSlots.id),
    student_count: text('student_count'),
    duration_minutes: text('duration_minutes'),
    status: text('status').default('planned'),
    note: text('note'),
    calculated_amount: text('calculated_amount'),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('idx_work_logs_date').on(table.date),
    index('idx_work_logs_slot').on(table.schedule_slot_id),
    index('idx_work_logs_user').on(table.user_id),
    index('idx_work_logs_user_date').on(table.user_id, table.date),
  ],
);

// 6. Pattern Assignments
export const patternAssignments = sqliteTable(
  'pattern_assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').references(() => users.id),
    start_date: text('start_date').notNull(),
    end_date: text('end_date').notNull(),
    pattern_id: integer('pattern_id').references(() => schedulePatterns.id),
  },
  (table) => [
    index('idx_pattern_assignments_dates').on(table.start_date, table.end_date),
    index('idx_pattern_assignments_pattern').on(table.pattern_id),
  ],
);

// 7. Chat Rooms
export const chatRooms = sqliteTable('chat_rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').default('group'),
  created_by: integer('created_by').references(() => users.id),
  expires_at: text('expires_at'),
  created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
});

// 8. Chat Messages
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    room_id: integer('room_id').references(() => chatRooms.id),
    sender_id: integer('sender_id').references(() => users.id),
    message: text('message').notNull(),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('idx_chat_messages_room').on(table.room_id),
    index('idx_chat_messages_room_created').on(table.room_id, table.created_at),
    index('idx_chat_messages_sender').on(table.sender_id),
  ],
);

// 9. Chat Room Members (composite primary key)
export const chatRoomMembers = sqliteTable(
  'chat_room_members',
  {
    room_id: integer('room_id')
      .notNull()
      .references(() => chatRooms.id),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    joined_at: text('joined_at').default(sql`(CURRENT_TIMESTAMP)`),
    last_read_at: text('last_read_at'),
  },
  (table) => [
    primaryKey({ columns: [table.room_id, table.user_id] }),
    index('idx_chat_room_members_user').on(table.user_id),
    index('idx_chat_room_members_room').on(table.room_id),
    index('idx_chat_room_members_user_room_read').on(
      table.user_id,
      table.room_id,
      table.last_read_at,
    ),
  ],
);

// 10. Broadcasts
export const broadcasts = sqliteTable(
  'broadcasts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sender_id: integer('sender_id').references(() => users.id),
    title: text('title'),
    message: text('message').notNull(),
    category: text('category').default('general'),
    expires_at: text('expires_at'),
    deleted_at: text('deleted_at'),
    send_push: integer('send_push').default(1),
    show_on_open: integer('show_on_open').default(0),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updated_at: text('updated_at'),
  },
  (table) => [
    index('idx_broadcasts_expires').on(table.expires_at),
    index('idx_broadcasts_deleted').on(table.deleted_at),
    index('idx_broadcasts_created').on(table.created_at),
  ],
);

// 11. Broadcast Reads (composite primary key)
export const broadcastReads = sqliteTable(
  'broadcast_reads',
  {
    broadcast_id: integer('broadcast_id')
      .notNull()
      .references(() => broadcasts.id),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    read_at: text('read_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    primaryKey({ columns: [table.broadcast_id, table.user_id] }),
    index('idx_broadcast_reads_user').on(table.user_id),
  ],
);

// 12. Announcements
export const announcements = sqliteTable(
  'announcements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    priority: text('priority').default('normal'),
    is_active: integer('is_active').default(1),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('idx_announcements_active').on(table.is_active),
    index('idx_announcements_active_created').on(table.is_active, table.created_at),
  ],
);

// 13. Push Subscriptions
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').references(() => users.id),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [index('idx_push_subscriptions_user').on(table.user_id)],
);

// 14. Salary Adjustments
export const salaryAdjustments = sqliteTable(
  'salary_adjustments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year_month: text('year_month').notNull(),
    adjustment_type: text('adjustment_type').notNull(),
    amount: integer('amount').notNull(),
    note: text('note'),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('idx_salary_adjustments_user').on(table.user_id),
    index('idx_salary_adjustments_user_month').on(table.user_id, table.year_month),
    index('idx_salary_adjustments_year_month').on(table.year_month),
  ],
);

// 15. File Access
export const fileAccess = sqliteTable(
  'file_access',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    filename: text('filename').notNull(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    room_id: integer('room_id'),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    unique('uq_file_access_filename_user_room').on(table.filename, table.user_id, table.room_id),
    index('idx_file_access_filename').on(table.filename),
    index('idx_file_access_user').on(table.user_id),
  ],
);

// 16. Schedule Events (塾内予定: 講師フォーラム、休講など)
export const scheduleEvents = sqliteTable(
  'schedule_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    event_type: text('event_type').default('other'),
    start_date: text('start_date').notNull(),
    end_date: text('end_date').notNull(),
    start_time: text('start_time'),
    end_time: text('end_time'),
    created_by: integer('created_by').references(() => users.id),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updated_at: text('updated_at'),
  },
  (table) => [
    index('idx_schedule_events_start_date').on(table.start_date),
    index('idx_schedule_events_date_range').on(table.start_date, table.end_date),
  ],
);

// 17. Refresh Tokens
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull().unique(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires_at: text('expires_at').notNull(),
    revoked: integer('revoked').default(0),
    // 正常ローテーションで revoke した時刻（ISO 文字列）。直後の並行リフレッシュを
    // 盗用と誤検知しないためのグレース判定に使う。revokeAllForUser（全無効化）は
    // この列をセットしないため、グレース対象外になる。
    revoked_at: text('revoked_at'),
    created_at: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('idx_refresh_tokens_token').on(table.token),
    index('idx_refresh_tokens_user').on(table.user_id),
  ],
);

// 18. OIDC Login States（Authentik へ送り出してから戻ってくるまでの一時状態）
// state をキーに PKCE の code_verifier と nonce を保持する。本番はクラスタで動くため、
// メモリではなく DB に置く（送り出したワーカーと受け取るワーカーが違いうる）。
// purpose = 'link' のときは、連携を始めたログイン中の利用者を user_id に持つ。
// コールバックは別サイト（Authentik）からの遷移なので SameSite=Strict のログイン Cookie が
// 届かず、ここでしか本人を特定できない。
export const oidcStates = sqliteTable('oidc_states', {
  state: text('state').primaryKey(),
  code_verifier: text('code_verifier').notNull(),
  nonce: text('nonce').notNull(),
  purpose: text('purpose').notNull(),
  user_id: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  created_at: text('created_at').notNull(),
});

// 19. WebAuthn Credentials（パスキー）
// 既存アカウントに足すもの。登録はログイン中に設定画面から、ログインはパスキーだけで行える。
// public_key / credential_id は base64url。counter はクローン検知用（多くのパスキーは常に 0）。
export const webauthnCredentials = sqliteTable(
  'webauthn_credentials',
  {
    id: text('id').primaryKey(), // credential ID（base64url）
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    public_key: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports'), // JSON 配列
    device_type: text('device_type'), // singleDevice / multiDevice
    backed_up: integer('backed_up').notNull().default(0),
    name: text('name').notNull(),
    created_at: text('created_at').notNull(),
    last_used_at: text('last_used_at'),
  },
  (table) => [index('idx_webauthn_credentials_user_id').on(table.user_id)],
);

// 20. WebAuthn Challenges（登録・ログインの途中状態）
// oidc_states と同じ理由で DB に置く（クラスタのワーカー間で共有）。id は httpOnly Cookie で渡す。
export const webauthnChallenges = sqliteTable('webauthn_challenges', {
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  purpose: text('purpose').notNull(), // register / login
  user_id: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  created_at: text('created_at').notNull(),
});

// 21. Email Tokens（メールアドレスの確認・パスワード再設定のリンク）
// token はハッシュ（SHA-256）だけを保存する。1回だけ使え、期限を過ぎたら無効
export const emailTokens = sqliteTable(
  'email_tokens',
  {
    token_hash: text('token_hash').primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(), // verify / reset
    email: text('email').notNull(), // verify: 確認するアドレス / reset: 送った先
    expires_at: text('expires_at').notNull(),
    created_at: text('created_at').notNull(),
  },
  (table) => [index('idx_email_tokens_user_id').on(table.user_id)],
);
