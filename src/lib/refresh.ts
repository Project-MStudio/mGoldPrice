import { scrapeAllStores } from "@/lib/scrape";
import { cacheLock } from "@/lib/cache";

// ============================================================================
// Wrapper "cào nền có cooldown" cho FLOW POLL của app (xem PROJECT_CONTEXT.md).
//
// App không có socket/realtime -> poll GET /api/price định kỳ. Mỗi lần poll, route trả data
// cache/DB NGAY rồi gọi hàm này qua `after()` (next/server) để cào nền làm tươi data.
//
// Hàm này KHÔNG chứa logic cào — nó chỉ thêm 2 thứ quanh service cào chung scrapeAllStores():
//
//   1) `after()` ở route đảm bảo cào chạy SAU response và Vercel giữ function sống tới khi xong
//      (đừng fire-and-forget: `return` là instance bị freeze, cào dở dang).
//   2) Cooldown GLOBAL qua Redis (cacheLock = SET NX EX), KHÔNG để biến RAM: mỗi serverless
//      instance có RAM riêng nên cooldown process-local vô dụng khi đông client (cào đè nhau).
//      Trong cửa sổ cooldown chỉ ĐÚNG 1 lần cào chạy, dù bao nhiêu client/instance.
//
// Khác /api/cron: cron gọi thẳng scrapeAllStores() (đồng bộ, KHÔNG cooldown — phải luôn chạy).
// Cùng dùng MỘT service cào scrapeAllStores() -> thêm tiệm chỉ sửa src/lib/stores.ts.
// ============================================================================

// Cooldown tính bằng GIÂY. Mặc định 60s. Đổi qua env PRICE_REFRESH_COOLDOWN_MS (ms, giữ tên cũ).
// = 0 -> tắt cooldown (cào mọi lần poll, hiếm khi cần).
const COOLDOWN_SECONDS = Math.max(
  Math.ceil(Number(process.env.PRICE_REFRESH_COOLDOWN_MS ?? 60_000) / 1000),
  0,
);

// Cào nền tất cả tiệm, có cooldown. Gọi qua `after()` trong route. KHÔNG bao giờ throw (việc nền).
export async function triggerBackgroundRefresh(): Promise<void> {
  try {
    if (COOLDOWN_SECONDS > 0 && !(await cacheLock("refresh:lock:all", COOLDOWN_SECONDS))) {
      return; // đang trong cooldown -> bỏ qua.
    }
    await scrapeAllStores();
  } catch (err) {
    console.error("[refresh] background refresh failed", err);
  }
}
