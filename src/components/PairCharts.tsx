import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type ChartSample = { t: string; a: number; b: number; ratio: number };
export type ChartTrade = { id: number; t: string; to_side: string };

type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

const UP = "#22c55e";
const DOWN = "#ef4444";
const GRID = "rgba(120,130,150,0.15)";

function buildCandles(samples: ChartSample[], bucketMin: number): Candle[] {
  const bucketMs = bucketMin * 60_000;
  const map = new Map<number, number[]>();
  for (const s of samples) {
    const key = Math.floor(new Date(s.t).getTime() / bucketMs) * bucketMs;
    const arr = map.get(key) ?? [];
    arr.push(s.ratio);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort((x, y) => x[0] - y[0])
    .map(([ts, vals]) => ({
      time: (ts / 1000) as UTCTimestamp,
      open: vals[0]!,
      high: Math.max(...vals),
      low: Math.min(...vals),
      close: vals[vals.length - 1]!,
    }));
}

function baseOptions(height: number) {
  return {
    height,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "rgba(140,150,170,0.95)",
      fontSize: 11,
      attributionLogo: false,
    },
    grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
    rightPriceScale: { borderColor: GRID },
    timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false, rightOffset: 4 },
    crosshair: { mode: 0 as const },
    localization: {
      locale: "fa-IR",
      priceFormatter: (p: number) => Number(p).toLocaleString("fa-IR", { maximumFractionDigits: 4 }),
    },
    handleScroll: true,
    handleScale: true,
  };
}

function useChart(height: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, baseOptions(height));
    chartRef.current = chart;
    setReady((n) => n + 1);
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  return { containerRef, chartRef, ready };
}

function ChartFrame({
  title,
  right,
  children,
  onReset,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="text-xs font-semibold">{title}</div>
        <div className="flex items-center gap-1">
          {right}
          <button
            onClick={onReset}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            بازنشانی زوم
          </button>
        </div>
      </div>
      {children}
      <div className="px-1 pt-1 text-[10px] text-muted-foreground">
        اسکرول = زوم • درگ = جابه‌جایی • دابل‌کلیک = بازنشانی
      </div>
    </div>
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
    const seen = new Set<number>();
    const out: { time: UTCTimestamp; ratio: number; ma: number | null }[] = [];
    samples.forEach((s, i) => {
      const time = Math.floor(new Date(s.t).getTime() / 1000) as UTCTimestamp;
      if (seen.has(time)) return;
      seen.add(time);
      const start = Math.max(0, i - maWindow + 1);
      const win = samples.slice(start, i + 1);
      const ma =
        win.length >= maWindow ? win.reduce((acc, w) => acc + w.ratio, 0) / win.length : null;
      out.push({ time, ratio: s.ratio, ma });
    });
    return out.map((p) => ({
      ...p,
      upper: p.ma == null ? null : p.ma * (1 + band),
      lower: p.ma == null ? null : p.ma * (1 - band),
    }));
  }, [samples, maWindow, bandPct]);

  const priceASeries = useMemo(() => {
    const seen = new Set<number>();
    return samples.map((s) => {
      const time = Math.floor(new Date(s.t).getTime() / 1000) as UTCTimestamp;
      if (seen.has(time)) return null;
      seen.add(time);
      return { time, value: s.a };
    }).filter(Boolean) as { time: UTCTimestamp; value: number }[];
  }, [samples]);

  const priceBSeries = useMemo(() => {
    const seen = new Set<number>();
    return samples.map((s) => {
      const time = Math.floor(new Date(s.t).getTime() / 1000) as UTCTimestamp;
      if (seen.has(time)) return null;
      seen.add(time);
      return { time, value: s.b };
    }).filter(Boolean) as { time: UTCTimestamp; value: number }[];
  }, [samples]);

  const candleChart = useChart(300);
  const ratioChart = useChart(300);
  const priceAChart = useChart(300);
  const priceBChart = useChart(300);

  // Candle chart
  useEffect(() => {
    const chart = candleChart.chartRef.current;
    if (!chart) return;
    const s = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    s.setData(candles);
    chart.timeScale().fitContent();
    return () => {
      try {
        chart.removeSeries(s);
      } catch {}
    };
  }, [candles, candleChart.ready]);

  // Ratio + MA + bands + trade markers
  useEffect(() => {
    const chart = ratioChart.chartRef.current;
    if (!chart) return;
    const opts = { priceFormat: { type: "price" as const, precision: 4, minMove: 0.0001 } };
    const ratio = chart.addSeries(LineSeries, {
      ...opts,
      color: "#3b82f6",
      lineWidth: 2,
      title: "نسبت",
    });
    const ma = chart.addSeries(LineSeries, {
      ...opts,
      color: "#f59e0b",
      lineWidth: 1,
      title: "میانگین",
    });
    const upper = chart.addSeries(LineSeries, {
      ...opts,
      color: DOWN,
      lineWidth: 1,
      lineStyle: 2,
      title: "باند بالا",
    });
    const lower = chart.addSeries(LineSeries, {
      ...opts,
      color: UP,
      lineWidth: 1,
      lineStyle: 2,
      title: "باند پایین",
    });
    ratio.setData(ratioSeries.map((p) => ({ time: p.time, value: p.ratio })));
    ma.setData(
      ratioSeries.filter((p) => p.ma != null).map((p) => ({ time: p.time, value: p.ma as number })),
    );
    upper.setData(
      ratioSeries
        .filter((p) => p.upper != null)
        .map((p) => ({ time: p.time, value: p.upper as number })),
    );
    lower.setData(
      ratioSeries
        .filter((p) => p.lower != null)
        .map((p) => ({ time: p.time, value: p.lower as number })),
    );

    const times = ratioSeries.map((p) => p.time);
    const markers = trades
      .map((tr) => {
        const ts = Math.floor(new Date(tr.t).getTime() / 1000);
        if (!times.length) return null;
        let nearest = times[0]!;
        for (const t of times) if (Math.abs(t - ts) < Math.abs(nearest - ts)) nearest = t;
        const buyA = tr.to_side === "A";
        return {
          time: nearest,
          position: buyA ? ("belowBar" as const) : ("aboveBar" as const),
          color: buyA ? UP : DOWN,
          shape: buyA ? ("arrowUp" as const) : ("arrowDown" as const),
          text: buyA ? `→ ${symbolA}` : `→ ${symbolB}`,
        };
      })
      .filter(Boolean) as any[];
    markers.sort((x, y) => x.time - y.time);
    const mk = createSeriesMarkers(ratio, markers);

    chart.timeScale().fitContent();
    return () => {
      try {
        mk.detach();
        [ratio, ma, upper, lower].forEach((s) => chart.removeSeries(s));
      } catch {}
    };
  }, [ratioSeries, trades, symbolA, symbolB, ratioChart.ready]);

  // Price of Fund A
  useEffect(() => {
    const chart = priceAChart.chartRef.current;
    if (!chart) return;
    const a = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      title: symbolA,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    a.setData(priceASeries);
    chart.timeScale().fitContent();
    return () => {
      try {
        chart.removeSeries(a);
      } catch {}
    };
  }, [priceASeries, symbolA, priceAChart.ready]);

  // Price of Fund B
  useEffect(() => {
    const chart = priceBChart.chartRef.current;
    if (!chart) return;
    const b = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      title: symbolB,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    b.setData(priceBSeries);
    chart.timeScale().fitContent();
    return () => {
      try {
        chart.removeSeries(b);
      } catch {}
    };
  }, [priceBSeries, symbolB, priceBChart.ready]);

  if (samples.length < 2) {
    return (
      <div className="rounded-md border border-border/60 p-4 text-xs text-muted-foreground">
        برای رسم نمودار حداقل ۲ نمونه لازم است.
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="ltr">
      <ChartFrame
        title={`نمودار کندلی نسبت ${symbolA}/${symbolB}`}
        onReset={() => candleChart.chartRef.current?.timeScale().fitContent()}
        right={
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
                {m.toLocaleString("fa-IR")}د
              </button>
            ))}
          </div>
        }
      >
        <div ref={candleChart.containerRef} className="w-full" />
      </ChartFrame>

      <ChartFrame
        title={`نسبت، میانگین ${maWindow.toLocaleString("fa-IR")} و باندها (فلش‌ها = معاملات)`}
        onReset={() => ratioChart.chartRef.current?.timeScale().fitContent()}
      >
        <div ref={ratioChart.containerRef} className="w-full" />
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartFrame
          title={`قیمت ${symbolA}`}
          onReset={() => priceAChart.chartRef.current?.timeScale().fitContent()}
        >
          <div ref={priceAChart.containerRef} className="w-full" />
        </ChartFrame>

        <ChartFrame
          title={`قیمت ${symbolB}`}
          onReset={() => priceBChart.chartRef.current?.timeScale().fitContent()}
        >
          <div ref={priceBChart.containerRef} className="w-full" />
        </ChartFrame>
      </div>
    </div>
  );
}
