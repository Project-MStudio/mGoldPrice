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
interface PriceEntry {
  store: string;
  store_name: string;
  price: {
    created_at: string | null;
    updated_at: string | null;
    data: GoldData | null;
  };
}
interface StoreHistory {
  store: string;
  store_name: string;
  history: { id: number; created_at: string; updated_at: string; data: GoldData }[];
}
interface HistoryRow {
  id: number;
  store: string;
  store_name: string;
  created_at: string;
  updated_at: string;
  data: GoldData;
}
interface StoreInfo {
  store_id: string;
  name: string;
  website: string;
}

const REFRESH_MS = 30_000;
const ALL = "all";

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

function StoreBadge({ name }: { name: string }) {
  return (
    <span className="bg-tonal text-tertiary rounded-badge border-border-subtle border px-2 py-0.5 text-xs font-medium">
      {name}
    </span>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-button px-3 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-brand text-app"
          : "bg-tonal text-secondary hover:bg-highlight hover:text-primary")
      }
    >
      {children}
    </button>
  );
}

export default function PriceView({ stores }: { stores: StoreInfo[] }) {
  const [selected, setSelected] = useState<string>(ALL);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = useCallback(async (sel: string) => {
    try {
      const q = sel === ALL ? "" : `?store=${sel}`;
      const [priceRes, histRes] = await Promise.all([
        fetch(`/api/price${q}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/history${q}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setPrices(priceRes as PriceEntry[]);
      const merged = (histRes as StoreHistory[])
        .flatMap((sh) =>
          sh.history.map((it) => ({ ...it, store: sh.store, store_name: sh.store_name })),
        )
        // created_at là ISO -> so sánh chuỗi = đúng thứ tự thời gian; mới nhất lên đầu
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      setHistory(merged);
      setError(null);
      setLastSync(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load(selected);
    const id = setInterval(() => load(selected), REFRESH_MS);
    return () => clearInterval(id);
  }, [load, selected]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-primary text-2xl font-bold">
            mPrice<span className="text-brand">Gold</span>
          </h1>
          <p className="text-secondary mt-1 text-sm">Giá vàng các tiệm · cập nhật realtime</p>
        </div>
        <span className="bg-tonal text-muted rounded-badge px-2 py-1 text-xs">
          auto 30s{lastSync ? ` · ${lastSync}` : ""}
        </span>
      </header>

      {/* Bộ lọc store */}
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterButton active={selected === ALL} onClick={() => setSelected(ALL)}>
          Tất cả
        </FilterButton>
        {stores.map((s) => (
          <FilterButton
            key={s.store_id}
            active={selected === s.store_id}
            onClick={() => setSelected(s.store_id)}
          >
            {s.name}
          </FilterButton>
        ))}
      </div>

      {error ? (
        <div className="border-error/40 bg-error/10 text-error rounded-card mb-6 border px-4 py-3 text-sm">
          Lỗi tải dữ liệu: {error}
        </div>
      ) : null}

      <div className="grid gap-5">
        {/* Giá hiện tại theo từng store đang chọn */}
        {prices.map((p) => (
          <Card key={p.store} title={`${p.store_name} · cập nhật ${fmt(p.price.updated_at)}`}>
            <div className="text-muted mb-1 text-xs tracking-wide uppercase">Trong nước</div>
            <PriceTable rows={p.price.data?.domestic ?? []} />
            {p.price.data?.world?.length ? (
              <>
                <div className="text-muted mt-4 mb-1 text-xs tracking-wide uppercase">
                  Thế giới
                </div>
                <PriceTable rows={p.price.data.world} />
              </>
            ) : null}
          </Card>
        ))}

        {/* Lịch sử thay đổi (gộp các store đang chọn, có nhãn store) */}
        <Card title={`Lịch sử thay đổi (${history.length})`}>
          {history.length === 0 ? (
            <p className="text-muted text-sm">Chưa có lịch sử.</p>
          ) : (
            <ul className="divide-border-subtle/40 divide-y">
              {history.map((h) => (
                <li key={`${h.store}-${h.id}`} className="py-3 first:pt-0 last:pb-0">
                  <div className="mb-2 flex items-center gap-2">
                    <StoreBadge name={h.store_name} />
                    <span className="text-secondary text-xs tabular-nums">{fmt(h.created_at)}</span>
                  </div>
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
