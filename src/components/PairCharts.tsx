import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartSample = { t: string; a: number; b: number; ratio: number };
export type ChartTrade = { id: number; t: string; to_side: string };

const fmt = (n: number, d = 4) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });

type Candle = { ts: number; o: number; h: number; l: number; c: number; hl: [number, number] };

function buildCandles(samples: ChartSample[], bucketMin: number): Candle[] {
  const bucketMs = bucketMin * 60_000;
  const map = new Map<number, ChartSample[]>();
  for (const s of samples) {
    const ts = new Date(s.t).getTime();
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort((x, y) => x[0] - y[0])
    .map(([ts, arr]) => {
      const vals = arr.map((s) => s.ratio);
      const o = vals[0]!;
      const c = vals[vals.length - 1]!;
      const h = Math.max(...vals);
      const l = Math.min(...vals);
      return { ts, o, h, l, c, hl: [l, h] as [number, number] };
    });
}

function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  const { o, h, l, c } = payload as Candle;
  const up = c >= o;
  const color = up ? "hsl(152 60% 45%)" : "hsl(0 72% 55%)";
  const span = h - l || 1;
  const yOf = (v: number) => y + ((h - v) / span) * height;
  const bodyTop = yOf(Math.max(o, c));
  const bodyBottom = yOf(Math.min(o, c));
  const bodyH = Math.max(1, bodyBottom - bodyTop);
  const cx = x + width / 2;
  const bw = Math.max(2, width * 0.6);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} />
    </g>
  );
}

export function PairCharts({
  samples,
  trades,
  maWindow,
  bandPct,
  symbolA,
  symbolB,
}: {
  samples: ChartSample[];
  trades: ChartTrade[];
  maWindow: number;
  bandPct: number;
  symbolA: string;
  symbolB: string;
}) {
  const [bucket, setBucket] = useState(15);

  const candles = useMemo(() => buildCandles(samples, bucket), [samples, bucket]);

  const ratioSeries = useMemo(() => {
    const band = Number(bandPct) / 100;
    return samples.map((s, i) => {
      const start = Math.max(0, i - maWindow + 1);
      const win = samples.slice(start, i + 1);
      const ma =
        win.length >= maWindow ? win.reduce((acc, w) => acc + w.ratio, 0) / win.length : null;
      return {
        ts: new Date(s.t).getTime(),
        ratio: s.ratio,
        ma,
        upper: ma == null ? null : ma * (1 + band),
        lower: ma == null ? null : ma * (1 - band),
      };
    });
  }, [samples, maWindow, bandPct]);

  const tradeMarks = useMemo(() => {
    if (!ratioSeries.length) return [];
    const min = ratioSeries[0]!.ts;
    const max = ratioSeries[ratioSeries.length - 1]!.ts;
    return trades
      .map((tr) => {
        const ts = new Date(tr.t).getTime();
        if (ts < min || ts > max) return null;
        let nearest = ratioSeries[0]!;
        for (const p of ratioSeries)
          if (Math.abs(p.ts - ts) < Math.abs(nearest.ts - ts)) nearest = p;
        return { id: tr.id, ts: nearest.ts, y: nearest.ratio, side: tr.to_side };
      })
      .filter(Boolean) as { id: number; ts: number; y: number; side: string }[];
  }, [trades, ratioSeries]);

  if (samples.length < 2) {
    return (
      <div className="rounded-md border border-border/60 p-4 text-xs text-muted-foreground">
        برای رسم نمودار حداقل ۲ نمونه لازم است.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">
          نمودار کندلی نسبت {symbolA}/{symbolB}
        </div>
        <div className="flex gap-1">
          {[5, 15, 30, 60].map((m) => (
            <button
              key={m}
              onClick={() => setBucket(m)}
              className={`rounded border px-2 py-0.5 text-[11px] ${
                bucket === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {m.toLocaleString("fa-IR")} دقیقه
            </button>
          ))}
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={candles} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.4} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtClock}
              tick={{ fontSize: 10 }}
              scale="time"
            />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 10 }}
              width={60}
              tickFormatter={(v) => fmt(v, 4)}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, direction: "rtl" }}
              labelFormatter={(v) => fmtClock(Number(v))}
              formatter={(_v, _n, item: any) => {
                const p = item?.payload as Candle;
                return [`O ${fmt(p.o)} • H ${fmt(p.h)} • L ${fmt(p.l)} • C ${fmt(p.c)}`, "کندل"];
              }}
            />
            <Bar dataKey="hl" shape={<CandleShape />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs font-semibold">
        نسبت، میانگین متحرک {maWindow.toLocaleString("fa-IR")} و باندها (نقاط = معاملات)
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={ratioSeries} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.4} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtClock}
              tick={{ fontSize: 10 }}
              scale="time"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10 }}
              width={60}
              tickFormatter={(v) => fmt(v, 4)}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, direction: "rtl" }}
              labelFormatter={(v) => fmtClock(Number(v))}
              formatter={(v: any, n: any) => [fmt(Number(v), 6), String(n)]}
            />
            <Line
              type="monotone"
              dataKey="ratio"
              name="نسبت"
              stroke="hsl(var(--primary))"
              dot={false}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma"
              name="میانگین"
              stroke="hsl(38 92% 50%)"
              dot={false}
              strokeWidth={1.2}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="upper"
              name="باند بالا"
              stroke="hsl(0 72% 55%)"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="lower"
              name="باند پایین"
              stroke="hsl(152 60% 45%)"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1}
              connectNulls
              isAnimationActive={false}
            />
            {tradeMarks.map((m) => (
              <ReferenceDot
                key={m.id}
                x={m.ts}
                y={m.y}
                r={4}
                fill={m.side === "A" ? "hsl(152 60% 45%)" : "hsl(0 72% 55%)"}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
