"use client";

import { useMemo, useState } from "react";
import type { HistoryRow } from "./price-view";

// ============================================================================
// Line chart SVG thuần (KHÔNG dùng lib) — biến động giá vàng theo giờ trong NGÀY.
// Dữ liệu lấy từ prop `history` (client-side đã có sẵn), KHÔNG gọi API mới.
// Trục X cố định 7h→20h; điểm đặt tại x = (giờ-7)*W + phút/60*W (W = width/giờ).
// Step-line: giữ ngang giá cũ tới x của mốc đổi rồi đi dọc sang giá mới.
// Mỗi loại vàng 1 màu cố định; MUA = nét đứt, BÁN = nét liền.
// ============================================================================

// --- Hình học (đơn vị viewBox) ---
const VBW = 800;
const VBH = 360;
const PAD = { left: 58, right: 16, top: 16, bottom: 30 };
const CHART_LEFT = PAD.left;
const CHART_RIGHT = VBW - PAD.right;
const CHART_TOP = PAD.top;
const CHART_BOTTOM = VBH - PAD.bottom;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = CHART_BOTTOM - CHART_TOP;

const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const W = CHART_W / (HOUR_END - HOUR_START); // width 1 giờ (13 khoảng giữa 7h..20h)

// Màu ổn định trên nền tối; gán theo index loại (đã sort tên) -> nhất quán giữa render.
const PALETTE = [
  "#CCFF00", "#36D399", "#3ABFF8", "#FBBD23", "#F87272",
  "#A78BFA", "#FB923C", "#22D3EE", "#E879F9", "#4ADE80",
];
const GRID = "#474944"; // = token border
const LABEL = "#9a9c92"; // muted

// Bỏ dấu phẩy -> number. "0"/"-"/rỗng -> null (không có giá, bỏ điểm).
function parsePrice(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampHour(t: number): number {
  return t < HOUR_START ? HOUR_START : t > HOUR_END ? HOUR_END : t;
}
function xAt(tHour: number): number {
  return CHART_LEFT + (clampHour(tHour) - HOUR_START) * W;
}
function abbrVnd(v: number): string {
  return (v / 1_000_000).toFixed(2) + "tr";
}
function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface Pt {
  t: number; // giờ thập phân (local), đã trong [7,20] sau clamp khi vẽ
  v: number;
}

// Gom các giá trị bằng nhau liên tiếp -> chỉ giữ MỐC ĐỔI (input theo thứ tự thời gian).
function changePoints(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) if (!out.length || out[out.length - 1].v !== p.v) out.push(p);
  return out;
}

interface Series {
  type: string;
  color: string;
  buy: Pt[]; // mốc đổi giá mua
  sell: Pt[]; // mốc đổi giá bán
}

// Path step: bắt đầu ở 7h (mép trái) tại giá đầu, ngang tới x mốc đổi rồi dọc sang giá mới,
// cuối cùng kéo ngang tới 20h (mép phải) ở giá cuối.
function stepPath(pts: Pt[], yAt: (v: number) => number): string {
  if (!pts.length) return "";
  const d: string[] = [`M ${CHART_LEFT.toFixed(1)} ${yAt(pts[0].v).toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    const x = xAt(pts[i].t).toFixed(1);
    d.push(`L ${x} ${yAt(pts[i - 1].v).toFixed(1)}`); // ngang ở giá cũ tới x mốc đổi
    d.push(`L ${x} ${yAt(pts[i].v).toFixed(1)}`); // dọc sang giá mới ngay tại x đó
  }
  d.push(`L ${CHART_RIGHT.toFixed(1)} ${yAt(pts[pts.length - 1].v).toFixed(1)}`);
  return d.join(" ");
}

export default function PriceChart({ history }: { history: HistoryRow[] }) {
  // Danh sách store có trong history (để dropdown).
  const storeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of history) if (!m.has(h.store)) m.set(h.store, h.store_name);
    return [...m].map(([id, name]) => ({ id, name }));
  }, [history]);

  const [selectedStore, setSelectedStore] = useState<string>("");
  const activeStore =
    storeOptions.find((s) => s.id === selectedStore)?.id ?? storeOptions[0]?.id ?? "";

  const model = useMemo(() => {
    if (!activeStore) return null;
    // history sort mới->cũ; lọc store đang chọn.
    const storeRows = history.filter((h) => h.store === activeStore);
    if (!storeRows.length) return null;

    // Ngày đang xem = ngày local của mốc MỚI NHẤT của store (production = hôm nay).
    const dayKey = localDayKey(storeRows[0].created_at);
    const dayLabel = new Date(storeRows[0].created_at).toLocaleDateString("vi-VN");

    // Các mốc trong ngày đó, đảo thành cũ->mới để dựng step.
    const rows = storeRows.filter((h) => localDayKey(h.created_at) === dayKey).reverse();
    if (!rows.length) return null;

    // Tập loại vàng (domestic only — cùng hệ giá để chung 1 trục Y).
    const typeSet = new Set<string>();
    for (const r of rows) for (const g of r.data.domestic) typeSet.add(g.name);
    const types = [...typeSet].sort();

    let minV = Infinity;
    let maxV = -Infinity;
    const series: Series[] = types
      .map((type, i): Series => {
        const buyRaw: Pt[] = [];
        const sellRaw: Pt[] = [];
        for (const r of rows) {
          const g = r.data.domestic.find((x) => x.name === type);
          if (!g) continue;
          const dt = new Date(r.created_at);
          const t = dt.getHours() + dt.getMinutes() / 60;
          const b = parsePrice(g.buy);
          const s = parsePrice(g.sell);
          if (b != null) {
            buyRaw.push({ t, v: b });
            if (b < minV) minV = b;
            if (b > maxV) maxV = b;
          }
          if (s != null) {
            sellRaw.push({ t, v: s });
            if (s < minV) minV = s;
            if (s > maxV) maxV = s;
          }
        }
        return { type, color: PALETTE[i % PALETTE.length], buy: changePoints(buyRaw), sell: changePoints(sellRaw) };
      })
      .filter((s) => s.buy.length || s.sell.length);

    if (!series.length || !Number.isFinite(minV) || !Number.isFinite(maxV)) return null;

    // pad ~5% trên/dưới.
    const range = maxV - minV || maxV * 0.01 || 1;
    const minY = minV - range * 0.05;
    const maxY = maxV + range * 0.05;
    const yAt = (v: number) => CHART_TOP + ((maxY - v) / (maxY - minY)) * CHART_H;
    const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);

    return { series, yAt, yTicks, dayLabel };
  }, [history, activeStore]);

  return (
    <section className="bg-elevated border-border-subtle rounded-card border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-secondary text-sm font-semibold tracking-wide uppercase">
          Biến động giá theo giờ
          {model ? <span className="text-muted ml-2 normal-case">· {model.dayLabel} · 7h–20h</span> : null}
        </h2>
        {storeOptions.length > 0 ? (
          <select
            value={activeStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="bg-tonal text-secondary rounded-button border-border-subtle border px-2 py-1 text-xs"
            aria-label="Chọn tiệm để xem biểu đồ"
          >
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id} className="bg-elevated">
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {!model ? (
        <p className="text-muted text-sm">Chưa có dữ liệu biểu đồ trong ngày.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full" role="img" aria-label="Biểu đồ biến động giá vàng theo giờ">
            {/* Lưới + nhãn trục Y (giá) */}
            {model.yTicks.map((v) => {
              const y = model.yAt(v);
              return (
                <g key={`y${v}`}>
                  <line x1={CHART_LEFT} y1={y} x2={CHART_RIGHT} y2={y} stroke={GRID} strokeWidth={0.5} strokeOpacity={0.4} />
                  <text x={CHART_LEFT - 6} y={y + 3} textAnchor="end" fontSize={10} fill={LABEL}>
                    {abbrVnd(v)}
                  </text>
                </g>
              );
            })}

            {/* Vạch + nhãn trục X (giờ 7..20) */}
            {HOURS.map((h) => {
              const x = CHART_LEFT + (h - HOUR_START) * W;
              return (
                <g key={`x${h}`}>
                  <line x1={x} y1={CHART_TOP} x2={x} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.5} strokeOpacity={0.16} />
                  <text x={x} y={CHART_BOTTOM + 14} textAnchor="middle" fontSize={9} fill={LABEL}>
                    {h}h
                  </text>
                </g>
              );
            })}

            {/* Trục đáy + trục trái */}
            <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.8} />
            <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_LEFT} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.8} />

            {/* Đường + điểm cho từng loại: mua (nét đứt) + bán (nét liền), cùng màu */}
            {model.series.map((s) => (
              <g key={s.type}>
                {s.buy.length > 0 ? (
                  <path d={stepPath(s.buy, model.yAt)} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
                ) : null}
                {s.sell.length > 0 ? (
                  <path d={stepPath(s.sell, model.yAt)} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
                ) : null}
                {s.buy.map((p, i) => (
                  <circle key={`b${i}`} cx={xAt(p.t)} cy={model.yAt(p.v)} r={2.3} fill={s.color} />
                ))}
                {s.sell.map((p, i) => (
                  <circle key={`s${i}`} cx={xAt(p.t)} cy={model.yAt(p.v)} r={2.3} fill={s.color} />
                ))}
              </g>
            ))}
          </svg>

          {/* Legend: màu theo loại + chú thích nét */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {model.series.map((s) => (
              <span key={s.type} className="text-secondary flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.type}
              </span>
            ))}
            <span className="text-muted ml-auto tabular-nums">╌╌ mua · ── bán</span>
          </div>
        </>
      )}
    </section>
  );
}
