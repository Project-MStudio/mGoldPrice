import { Redis } from "@upstash/redis";

// Lớp cache (Upstash Redis REST — hợp serverless). Nếu thiếu env -> cache tự tắt
// (mọi hàm thành no-op), API vẫn chạy đọc thẳng DB. Lỗi Redis cũng không làm vỡ request.
let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

const DEFAULT_TTL = 600; // giây — safety net; ghi DB sẽ invalidate sớm hơn

export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return (await c.get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(key, value, { ex: ttl });
  } catch {
    // ignore
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const c = getClient();
  if (!c || keys.length === 0) return;
  try {
    await c.del(...keys);
  } catch {
    // ignore
  }
}

// Helpers tên key thống nhất giữa nơi đọc (queries) và nơi invalidate (scrape).
export const cacheKeys = {
  stores: "stores",
  pricesAll: "price:all",
  price: (storeId: string) => `price:${storeId}`,
  historiesAll: "history:all",
  history: (storeId: string) => `history:${storeId}`,
};
