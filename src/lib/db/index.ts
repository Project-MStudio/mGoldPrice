import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Lazy singleton: không khởi tạo (và không throw) lúc import/build khi chưa có env.
// Chỉ tạo connection khi route handler thực sự gọi getDb() lúc runtime.
let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  _db = drizzle(neon(url), { schema });
  return _db;
}

export { schema };
