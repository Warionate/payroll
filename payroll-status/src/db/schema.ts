import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // 'incident' | 'maintenance' | 'update' | 'resolved'
  // 'none' | 'scheduled' | 'investigating' | 'identified' | 'monitoring' | 'resolved'
  // resolved と scheduled（予定）以外は「進行中」として表示ステータスに効く
  status: text('status').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(), // Markdown
  source: text('source').notNull(), // 'auto' | 'admin' | 'discord'
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Setting = typeof settings.$inferSelect;
