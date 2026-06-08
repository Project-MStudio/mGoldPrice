// Seed store mặc định "Kim Phát".
// Chạy: npm run db:seed  (CẦN DATABASE_URL trong .env và đã chạy migration trước).
// Import có đuôi .ts vì chạy trực tiếp bằng node --experimental-strip-types.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { store } from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const db = drizzle(neon(url));

await db
  .insert(store)
  .values({
    storeId: "kimphat",
    name: "Kim Phát",
    website: "https://kimphat.evosoft.vn/",
  })
  .onConflictDoNothing();

console.log("Seeded store: kimphat (Kim Phát)");
