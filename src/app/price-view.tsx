"use client";

import { useCallback, useEffect, useState } from "react";

interface GoldRow {
  name: string;
  buy: string;
  sell: string;
  time: string;
}
interface GoldData {
  domestic: GoldRow[];
  world: GoldRow[];
}
interface PriceResponse {
  store_id: string;
  store_name: string;
  created_at: string | null;
  updated_at: string | null;
  data: GoldData | null;
}
interface HistoryItem {
  id: number;
  created_at: string;
  updated_at: string;
  data: GoldData;
}
interface HistoryResponse {
  history: HistoryItem[];
}

const REFRESH_MS = 30_000;

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("vi-VN", { hour12: false });
}

function PriceTable({ rows }: { rows: GoldRow[] }) {
  if (!rows.length) {
    return <p className="text-muted text-sm">Chưa có dữ liệu.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-secondary border-border-subtle border-b text-left">
            <th className="py-2 pr-4 font-medium">Loại</th>
            <th className="py-2 pr-4 text-right font-medium">Mua</th>
            <th className="py-2 pr-4 text-right font-medium">Bán</th>
            <th className="text-muted py-2 text-right font-medium">Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-border-subtle/40 border-b last:border-0">
              <td className="text-primary py-2 pr-4 font-medium">{r.name}</td>
              <td className="text-brand py-2 pr-4 text-right tabular-nums">{r.buy}</td>
              <td className="text-brand-secondary py-2 pr-4 text-right tabular-nums">{r.sell}</td>
              <td className="text-muted py-2 text-right text-xs tabular-nums">{r.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-elevated border-border-subtle rounded-card border p-5">
      {title ? (
        <h2 className="font-display text-secondary mb-3 text-sm font-semibold tracking-wide uppercase">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export default function PriceView({
  initialPrice,
  initialHistory,
}: {
  initialPrice: PriceResponse | null;
  initialHistory: HistoryItem[];
}) {
  const [price, setPrice] = useState<PriceResponse | null>(initialPrice);
  // initialHistory là asc (cũ -> mới); hiển thị mới nhất lên đầu
  const [history, setHistory] = useState<HistoryItem[]>([...initialHistory].reverse());
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, hRes] = await Promise.all([
        fetch("/api/price", { cache: "no-store" }),
        fetch("/api/history", { cache: "no-store" }),
      ]);
      if (!pRes.ok || !hRes.ok) throw new Error("API error");
      const p: PriceResponse = await pRes.json();
      const h: HistoryResponse = await hRes.json();
      setPrice(p);
      setHistory([...h.history].reverse());
      setError(null);
      setLastSync(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-primary text-2xl font-bold">
            mPrice<span className="text-brand">Gold</span>
          </h1>
          <p className="text-secondary mt-1 text-sm">
            {price?.store_name ?? "Giá vàng"} · cập nhật {fmt(price?.updated_at ?? null)}
          </p>
        </div>
        <span className="bg-tonal text-muted rounded-badge px-2 py-1 text-xs">
          auto 30s{lastSync ? ` · ${lastSync}` : ""}
        </span>
      </header>

      {error ? (
        <div className="border-error/40 bg-error/10 text-error rounded-card mb-6 border px-4 py-3 text-sm">
          Lỗi tải dữ liệu: {error}
        </div>
      ) : null}

      <div className="grid gap-5">
        <Card title="Vàng trong nước">
          <PriceTable rows={price?.data?.domestic ?? []} />
        </Card>

        <Card title="Vàng thế giới">
          <PriceTable rows={price?.data?.world ?? []} />
        </Card>

        <Card title={`Lịch sử thay đổi (${history.length})`}>
          {history.length === 0 ? (
            <p className="text-muted text-sm">Chưa có lịch sử.</p>
          ) : (
            <ul className="divide-border-subtle/40 divide-y">
              {history.map((h) => (
                <li key={h.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="text-secondary mb-2 text-xs tabular-nums">{fmt(h.created_at)}</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {h.data.domestic.map((r) => (
                      <span key={r.name} className="text-muted">
                        {r.name}: <span className="text-brand tabular-nums">{r.buy}</span>
                        <span className="text-border-default"> / </span>
                        <span className="text-brand-secondary tabular-nums">{r.sell}</span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <footer className="text-muted mt-10 text-center text-xs">mPriceGold · dark only</footer>
    </main>
  );
}
