"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { HistoryRow } from "./price-view";

// ============================================================================
// Line chart SVG thuần (KHÔNG dùng lib) — biến động giá vàng theo NGÀY / TUẦN / THÁNG.
// Dữ liệu lấy từ prop `history` (client-side đã có sẵn FULL lịch sử), KHÔNG gọi API mới.
// Trục X là 1 khoảng thời gian chuẩn hoá [0,1] -> pixel:
//   - day:   1 ngày, 7h→20h, vạch mỗi giờ.
//   - week:  7 ngày gần nhất, vạch mỗi ngày (dd/MM).
//   - month: 30 ngày gần nhất, vạch mỗi 5 ngày (dd/MM).
// Điểm đặt tại f = (thời điểm - đầu kỳ) / (cuối kỳ - đầu kỳ).
// Step-line: giữ ngang giá cũ tới x của mốc đổi rồi đi dọc sang giá mới (chỉ vẽ MỐC ĐỔI).
// Mỗi loại vàng 1 màu cố định; MUA = nét đứt, BÁN = nét liền.
// Hover line/node -> tooltip giá + thời điểm; line đang hover sáng, các line khác mờ đi.
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
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// --- Bộ lọc khoảng thời gian (filter ngày/tuần/tháng) ---
type Range = "day" | "week" | "month";
const RANGE_ORDER: Range[] = ["day", "week", "month"];
const RANGE_LABELS: Record<Range, string> = { day: "Ngày", week: "Tuần", month: "Tháng" };

// Màu ổn định trên nền tối; gán theo index loại (đã sort tên) -> nhất quán giữa render.
const PALETTE = [
  "#CCFF00", "#36D399", "#3ABFF8", "#FBBD23", "#F87272",
  "#A78BFA", "#FB923C", "#22D3EE", "#E879F9", "#4ADE80",
];
const GRID = "#474944"; // = token border
const LABEL = "#9a9c92"; // muted
const TIP_BG = "#1b1c16";
const TIP_TEXT = "#e9eadf";
const DIM_OPACITY = 0.16; // độ mờ của các line KHÔNG được hover

// Bỏ dấu phẩy -> number. "0"/"-"/rỗng -> null (không có giá, bỏ điểm).
function parsePrice(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clamp01(f: number): number {
  if (f < 0) return 0;
  if (f > 1) return 1;
  return f;
}
function xOf(f: number): number {
  return CHART_LEFT + clamp01(f) * CHART_W;
}
function abbrVnd(v: number): string {
  return (v / 1_000_000).toFixed(2) + "tr";
}
function fmtVnd(v: number): string {
  return v.toLocaleString("vi-VN");
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

interface Pt {
  f: number; // vị trí X chuẩn hoá [0,1] trong kỳ đang xem
  v: number; // giá
  t: number; // thời điểm thực (ms) của mốc đổi giá này
}

// Gom các giá trị bằng nhau liên tiếp -> chỉ giữ MỐC ĐỔI (input theo thứ tự thời gian).
function changePoints(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) if (!out.length || out[out.length - 1].v !== p.v) out.push(p);
  return out;
}

// Giá đang "giữ" tại vị trí f (step-line) = mốc đổi gần nhất có f' <= f (mặc định mốc đầu).
function valueAt(pts: Pt[], f: number): Pt | null {
  if (!pts.length) return null;
  let cur = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].f <= f) cur = pts[i];
    else break;
  }
  return cur;
}

interface Tick {
  f: number;
  label: string;
}
interface Axis {
  start: number; // ms — đầu kỳ
  end: number; // ms — cuối kỳ (loại trừ)
  ticks: Tick[];
  rangeLabel: string; // chú thích kỳ trên tiêu đề
}

// Dựng trục X theo mode. anchor = mốc dữ liệu MỚI NHẤT của store (production = hôm nay).
function buildAxis(range: Range, anchor: Date): Axis {
  const day0 = startOfDay(anchor).getTime();
  if (range === "day") {
    const start = day0 + HOUR_START * HOUR_MS;
    const end = day0 + HOUR_END * HOUR_MS;
    const ticks = HOURS.map((h) => ({ f: (h - HOUR_START) / (HOUR_END - HOUR_START), label: `${h}h` }));
    return { start, end, ticks, rangeLabel: `${anchor.toLocaleDateString("vi-VN")} · 7h–20h` };
  }
  // week | month: N ngày gần nhất, ngày anchor nằm trọn ô cuối.
  const days = range === "week" ? 7 : 30;
  const step = range === "week" ? 1 : 5;
  const start = day0 - (days - 1) * DAY_MS;
  const end = day0 + DAY_MS;
  const ticks: Tick[] = [];
  for (let i = 0; i < days; i += step) {
    ticks.push({ f: (i + 0.5) / days, label: ddmm(start + i * DAY_MS) });
  }
  return { start, end, ticks, rangeLabel: `${ddmm(start)}–${ddmm(day0)}` };
}

// Path step: bắt đầu ở mép trái (đầu kỳ) tại giá đầu, ngang tới x mốc đổi rồi dọc sang giá mới,
// cuối cùng kéo ngang tới mép phải (cuối kỳ) ở giá cuối.
function stepPath(pts: Pt[], yAt: (v: number) => number): string {
  if (!pts.length) return "";
  const d: string[] = [`M ${CHART_LEFT.toFixed(1)} ${yAt(pts[0].v).toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    const x = xOf(pts[i].f).toFixed(1);
    d.push(`L ${x} ${yAt(pts[i - 1].v).toFixed(1)}`); // ngang ở giá cũ tới x mốc đổi
    d.push(`L ${x} ${yAt(pts[i].v).toFixed(1)}`); // dọc sang giá mới ngay tại x đó
  }
  d.push(`L ${CHART_RIGHT.toFixed(1)} ${yAt(pts[pts.length - 1].v).toFixed(1)}`);
  return d.join(" ");
}

interface Series {
  type: string;
  color: string;
  buy: Pt[]; // mốc đổi giá mua
  sell: Pt[]; // mốc đổi giá bán
}

interface Tip {
  x: number;
  y: number;
  title: string;
  value: string;
  sub: string;
  color: string;
}

// Kích thước hộp tooltip (đơn vị viewBox).
const TIP_W = 138;
const TIP_H = 46;

export default function PriceChart({ history }: { history: HistoryRow[] }) {
  // Danh sách store có trong history (để dropdown).
  const storeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of history) if (!m.has(h.store)) m.set(h.store, h.store_name);
    return [...m].map(([id, name]) => ({ id, name }));
  }, [history]);

  const [selectedStore, setSelectedStore] = useState<string>("");
  const [range, setRange] = useState<Range>("day");
  const [hoverType, setHoverType] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const activeStore =
    storeOptions.find((s) => s.id === selectedStore)?.id ?? storeOptions[0]?.id ?? "";

  const model = useMemo(() => {
    if (!activeStore) return null;
    // history sort mới->cũ; lọc store đang chọn.
    const storeRows = history.filter((h) => h.store === activeStore);
    if (!storeRows.length) return null;

    // Kỳ đang xem neo theo mốc MỚI NHẤT của store (production = hôm nay).
    const axis = buildAxis(range, new Date(storeRows[0].created_at));
    const span = axis.end - axis.start || 1;

    // Các mốc trong kỳ, đảo thành cũ->mới để dựng step.
    const rows = storeRows
      .filter((h) => {
        const ms = new Date(h.created_at).getTime();
        return ms >= axis.start && ms < axis.end;
      })
      .reverse();
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
          const ms = new Date(r.created_at).getTime();
          const f = (ms - axis.start) / span;
          const b = parsePrice(g.buy);
          const s = parsePrice(g.sell);
          if (b != null) {
            buyRaw.push({ f, v: b, t: ms });
            if (b < minV) minV = b;
            if (b > maxV) maxV = b;
          }
          if (s != null) {
            sellRaw.push({ f, v: s, t: ms });
            if (s < minV) minV = s;
            if (s > maxV) maxV = s;
          }
        }
        return { type, color: PALETTE[i % PALETTE.length], buy: changePoints(buyRaw), sell: changePoints(sellRaw) };
      })
      .filter((s) => s.buy.length || s.sell.length);

    if (!series.length || !Number.isFinite(minV) || !Number.isFinite(maxV)) return null;

    // pad ~5% trên/dưới.
    const vSpan = maxV - minV || maxV * 0.01 || 1;
    const minY = minV - vSpan * 0.05;
    const maxY = maxV + vSpan * 0.05;
    const yAt = (v: number) => CHART_TOP + ((maxY - v) / (maxY - minY)) * CHART_H;
    const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);

    return { series, yAt, yTicks, ticks: axis.ticks, rangeLabel: axis.rangeLabel };
  }, [history, activeStore, range]);

  // Format thời điểm trên tooltip theo kỳ đang xem.
  const fmtTime = useCallback(
    (ms: number) => {
      const d = new Date(ms);
      if (range === "day") {
        return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
      }
      return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    },
    [range],
  );

  const clearHover = useCallback(() => {
    setHoverType(null);
    setTip(null);
  }, []);

  // Đổi kỳ/store -> xoá hover cũ (toạ độ tip thuộc model cũ).
  const onRange = useCallback(
    (r: Range) => {
      setRange(r);
      clearHover();
    },
    [clearHover],
  );

  // Di chuột trên 1 line (hit-area) -> tìm mốc giá đang giữ tại x con trỏ, hiện tooltip + làm mờ line khác.
  const onLineMove = useCallback(
    (e: React.MouseEvent, s: Series, kind: "buy" | "sell") => {
      const pts = kind === "buy" ? s.buy : s.sell;
      const svg = svgRef.current;
      if (!pts.length || !model || !svg) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
      const f = clamp01((vbX - CHART_LEFT) / CHART_W);
      const cp = valueAt(pts, f);
      if (!cp) return;
      setHoverType(s.type);
      setTip({
        x: xOf(f),
        y: model.yAt(cp.v),
        title: `${s.type} · ${kind === "buy" ? "Mua" : "Bán"}`,
        value: fmtVnd(cp.v),
        sub: fmtTime(cp.t),
        color: s.color,
      });
    },
    [model, fmtTime],
  );

  // Vị trí hộp tooltip — né mép phải/trên.
  let tipBoxX = 0;
  let tipBoxY = 0;
  if (tip) {
    tipBoxX = tip.x + 10;
    if (tipBoxX + TIP_W > CHART_RIGHT) tipBoxX = tip.x - 10 - TIP_W;
    if (tipBoxX < CHART_LEFT) tipBoxX = CHART_LEFT;
    tipBoxY = tip.y - TIP_H - 8;
    if (tipBoxY < CHART_TOP) tipBoxY = tip.y + 10;
  }

  return (
    <section className="bg-elevated border-border-subtle rounded-card border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-secondary text-sm font-semibold tracking-wide uppercase">
          Biến động giá
          {model ? <span className="text-muted ml-2 normal-case">· {model.rangeLabel}</span> : null}
        </h2>
        <div className="flex items-center gap-2">
          {/* Bộ lọc kỳ: Ngày / Tuần / Tháng */}
          <div className="bg-tonal rounded-button flex p-0.5">
            {RANGE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRange(r)}
                className={
                  "rounded-button px-2.5 py-1 text-xs font-medium transition-colors " +
                  (range === r ? "bg-brand text-app" : "text-secondary hover:text-primary")
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {storeOptions.length > 0 ? (
            <select
              value={activeStore}
              onChange={(e) => {
                setSelectedStore(e.target.value);
                clearHover();
              }}
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
      </div>

      {!model ? (
        <p className="text-muted text-sm">Chưa có dữ liệu biểu đồ trong kỳ này.</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VBW} ${VBH}`}
            className="w-full"
            role="img"
            aria-label="Biểu đồ biến động giá vàng"
            onMouseLeave={clearHover}
          >
            {/* Lưới + nhãn trục Y (giá) */}
            {model.yTicks.map((v) => {
              const y = model.yAt(v);
              return (
                <g key={`y${v}`} style={{ pointerEvents: "none" }}>
                  <line x1={CHART_LEFT} y1={y} x2={CHART_RIGHT} y2={y} stroke={GRID} strokeWidth={0.5} strokeOpacity={0.4} />
                  <text x={CHART_LEFT - 6} y={y + 3} textAnchor="end" fontSize={10} fill={LABEL}>
                    {abbrVnd(v)}
                  </text>
                </g>
              );
            })}

            {/* Vạch + nhãn trục X (giờ / ngày tuỳ kỳ) */}
            {model.ticks.map((t) => {
              const x = xOf(t.f);
              return (
                <g key={`x${t.label}`} style={{ pointerEvents: "none" }}>
                  <line x1={x} y1={CHART_TOP} x2={x} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.5} strokeOpacity={0.16} />
                  <text x={x} y={CHART_BOTTOM + 14} textAnchor="middle" fontSize={9} fill={LABEL}>
                    {t.label}
                  </text>
                </g>
              );
            })}

            {/* Trục đáy + trục trái */}
            <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.8} style={{ pointerEvents: "none" }} />
            <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_LEFT} y2={CHART_BOTTOM} stroke={GRID} strokeWidth={0.8} style={{ pointerEvents: "none" }} />

            {/* Đường + điểm cho từng loại (không bắt sự kiện; hover qua hit-area bên dưới).
                Line đang hover sáng; các line khác mờ đi (DIM_OPACITY). */}
            {model.series.map((s) => {
              const dim = hoverType !== null && hoverType !== s.type;
              return (
                <g key={s.type} opacity={dim ? DIM_OPACITY : 1} style={{ pointerEvents: "none", transition: "opacity 120ms ease" }}>
                  {s.buy.length > 0 ? (
                    <path d={stepPath(s.buy, model.yAt)} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
                  ) : null}
                  {s.sell.length > 0 ? (
                    <path d={stepPath(s.sell, model.yAt)} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
                  ) : null}
                  {s.buy.map((p, i) => (
                    <circle key={`b${i}`} cx={xOf(p.f)} cy={model.yAt(p.v)} r={2.3} fill={s.color} />
                  ))}
                  {s.sell.map((p, i) => (
                    <circle key={`s${i}`} cx={xOf(p.f)} cy={model.yAt(p.v)} r={2.3} fill={s.color} />
                  ))}
                </g>
              );
            })}

            {/* Hit-area: nét trong suốt dày để hover line/node dễ dàng (nằm trên cùng). */}
            {model.series.map((s) => (
              <g key={`hit-${s.type}`}>
                {s.buy.length > 0 ? (
                  <path
                    d={stepPath(s.buy, model.yAt)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ pointerEvents: "stroke" }}
                    onMouseEnter={(e) => onLineMove(e, s, "buy")}
                    onMouseMove={(e) => onLineMove(e, s, "buy")}
                    onMouseLeave={clearHover}
                  />
                ) : null}
                {s.sell.length > 0 ? (
                  <path
                    d={stepPath(s.sell, model.yAt)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ pointerEvents: "stroke" }}
                    onMouseEnter={(e) => onLineMove(e, s, "sell")}
                    onMouseMove={(e) => onLineMove(e, s, "sell")}
                    onMouseLeave={clearHover}
                  />
                ) : null}
              </g>
            ))}

            {/* Crosshair + marker + tooltip giá tại thời điểm hover */}
            {tip ? (
              <g style={{ pointerEvents: "none" }}>
                <line x1={tip.x} y1={CHART_TOP} x2={tip.x} y2={CHART_BOTTOM} stroke={tip.color} strokeWidth={0.6} strokeOpacity={0.5} strokeDasharray="3 3" />
                <circle cx={tip.x} cy={tip.y} r={3.8} fill={tip.color} stroke={TIP_BG} strokeWidth={1.4} />
                <rect x={tipBoxX} y={tipBoxY} width={TIP_W} height={TIP_H} rx={6} fill={TIP_BG} stroke={tip.color} strokeOpacity={0.6} />
                <text x={tipBoxX + 9} y={tipBoxY + 16} fontSize={10} fill={tip.color}>
                  {tip.title}
                </text>
                <text x={tipBoxX + 9} y={tipBoxY + 30} fontSize={13} fill={TIP_TEXT} className="tabular-nums">
                  {tip.value}
                </text>
                <text x={tipBoxX + 9} y={tipBoxY + 42} fontSize={9} fill={LABEL} className="tabular-nums">
                  {tip.sub}
                </text>
              </g>
            ) : null}
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
