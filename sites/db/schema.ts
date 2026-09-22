import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Keep the established API documents intact while moving durable storage to D1.
export const records = sqliteTable('records', {
  kind: text('kind').notNull(), id: text('id').notNull(), data: text('data').notNull(),
}, t => [
  primaryKey({ columns: [t.kind, t.id] }),
  check('valid_json', sql`json_valid(${t.data})`),
  check('nonnegative_stock', sql`${t.kind} != 'products' OR json_extract(${t.data}, '$.stock') >= 0`),
  uniqueIndex('unique_user_email').on(sql`json_extract(${t.data}, '$.email')`).where(sql`${t.kind} = 'users'`),
  uniqueIndex('unique_product_sku').on(sql`json_extract(${t.data}, '$.sku')`).where(sql`${t.kind} = 'products'`),
  uniqueIndex('unique_category_slug').on(sql`json_extract(${t.data}, '$.slug')`).where(sql`${t.kind} = 'categories'`),
  index('order_customer').on(sql`json_extract(${t.data}, '$.user_id')`).where(sql`${t.kind} = 'orders'`),
  uniqueIndex('unique_order_request').on(sql`json_extract(${t.data}, '$.user_id')`, sql`json_extract(${t.data}, '$.idempotency_key')`).where(sql`${t.kind} = 'orders'`),
]);
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), userId: text('user_id').notNull(), expires: integer('expires').notNull(),
  tokenVersion: integer('token_version').notNull().default(0),
}, t => [index('session_user').on(t.userId), index('session_expiry').on(t.expires)]);
export const attempts = sqliteTable('login_attempts', {
  key: text('key').primaryKey(), count: integer('count').notNull().default(0), expires: integer('expires').notNull(),
}, t => [index('rate_expiry').on(t.expires)]);
