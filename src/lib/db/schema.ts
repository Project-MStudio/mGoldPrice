import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// store_id là text PK đồng thời là "định danh store" dùng ở API (?store=kimphat).
// Thêm tiệm mới = insert thêm 1 row store + 1 entry parser trong src/lib/stores.ts,
// không phải đổi schema.
export const store = pgTable("store", {
  storeId: text("store_id").primaryKey(),
  name: text("name").notNull(),
  website: text("website").notNull(),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => store.storeId),
  // chuỗi đã encode (base64 của canonical JSON) — xem src/lib/encode.ts
  dataString: text("data_string").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Store = typeof store.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
