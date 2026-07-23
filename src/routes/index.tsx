import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSymbolPrices } from "@/lib/tse.functions";
import {
  ALL_SYMBOLS,
  BAND,
  MA_WINDOW,
  PAIRS,
  START_CAPITAL,
  POLL_INTERVAL_MS,
  addSample,
  computeMA,
  currentPortfolioValue,
  equivalentUnitsA,
  evaluateSignal,
  executeSignal,
  loadPair,
  resetPair,
  savePair,
  type PairConfig,
  type PairState,
} from "@/lib/rotation-engine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "چرخش صندوق‌های طلا — سیگنال لحظه‌ای و بک‌تست مجازی" },
      {
        name: "description",
        content:
          "داشبورد فارسی پایش لحظه‌ای ۴ جفت از صندوق‌های طلای ایران، تولید سیگنال چرخش بر پایه MA20 و شبیه‌سازی معاملات با کارمزد واقعی.",
      },
      { property: "og:title", content: "چرخش صندوق‌های طلا" },
      { property: "og:description", content: "سیگنال چرخش لحظه‌ای بین صندوق‌های طلای ایران." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const fmtNum = (n: number | undefined | null, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtToman = (n: number) =>
  Math.round(n).toLocaleString("fa-IR") + " تومان";
const fmtPct = (n: number | null, d = 3) =>
  n == null ? "—" : (n * 100).toLocaleString("fa-IR", { maximumFractionDigits: d }) + "٪";
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Dashboard() {
  const [states, setStates] = useState<Record<string, PairState>>({});
  const [prices, setPrices] = useState<Record<string, { last?: number; error?: string }>>({});
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "fetching" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const running = useRef(false);

  // بارگذاری اولیه از localStorage
  useEffect(() => {
    const initial: Record<string, PairState> = {};
    for (const p of PAIRS) initial[p.id] = loadPair(p);
    setStates(initial);
  }, []);

  const fetchOnce = async () => {
    if (running.current) return;
    running.current = true;
    setStatus("fetching");
    try {
      const res = await getSymbolPrices({ data: { symbols: ALL_SYMBOLS } });
      setPrices(res.prices as any);
      setLastFetch(res.fetchedAt);
      const now = res.fetchedAt;
      setStates((prev) => {
        const next: Record<string, PairState> = { ...prev };
        for (const p of PAIRS) {
          const s = next[p.id] ?? loadPair(p);
          const pa = (res.prices as any)[p.symbolA]?.last;
          const pb = (res.prices as any)[p.symbolB]?.last;
          if (pa && pb) {
            addSample(s, pa, pb, now);
            executeSignal(s, pa, pb, now);
            savePair(s);
          }
          next[p.id] = { ...s };
        }
        return next;
      });
      setStatus("ok");
      setErrorMsg(null);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "خطا در دریافت قیمت");
    } finally {
      running.current = false;
    }
  };

  // Polling
  useEffect(() => {
    fetchOnce();
    const id = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    const clockId = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(clockId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">چرخش صندوق‌های طلای ایران</h1>
            <p className="text-sm text-muted-foreground mt-1">
              فوروارد تست زنده • MA{MA_WINDOW} • باند {(BAND * 100).toFixed(1)}٪ • کارمزد فروش
              ۰.۲۴٪ • سرمایه‌ی هر جفت: {fmtToman(START_CAPITAL)}
            </p>
          </div>
          <div className="text-sm text-left">
            <div>
              وضعیت:{" "}
              <span
                className={
                  status === "ok"
                    ? "text-emerald-500"
                    : status === "fetching"
                      ? "text-amber-500"
                      : status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                }
              >
                {status === "ok"
                  ? "به‌روز"
                  : status === "fetching"
                    ? "در حال دریافت…"
                    : status === "error"
                      ? "خطا"
                      : "—"}
              </span>
            </div>
            <div className="text-muted-foreground">
              آخرین دریافت: {lastFetch ? fmtTime(lastFetch) : "—"} • ساعت:{" "}
              {fmtTime(Date.now())}
              <span className="hidden">{tick}</span>
            </div>
            {errorMsg && <div className="text-destructive text-xs mt-1">{errorMsg}</div>}
            <button
              onClick={fetchOnce}
              className="mt-2 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              به‌روزرسانی دستی
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <PriceRow prices={prices} />
        <div className="grid gap-6 md:grid-cols-2">
          {PAIRS.map((p) => (
            <PairCard
              key={p.id}
              cfg={p}
              state={states[p.id]}
              onReset={() => {
                const s = resetPair(p);
                setStates((prev) => ({ ...prev, [p.id]: s }));
              }}
            />
          ))}
        </div>

        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">راهنمای سریع منطق</summary>
          <ul className="mt-3 space-y-2 text-muted-foreground list-disc pr-5">
            <li>هر ۳۰ ثانیه قیمت لحظه‌ای «آخرین معامله» از TSETMC خوانده می‌شود.</li>
            <li>هر ۵ دقیقه یک نمونه‌ی جدید به سری زمانی Ratio اضافه می‌شود.</li>
            <li>
              اگر انحراف Ratio از MA{MA_WINDOW} از +{(BAND * 100).toFixed(1)}٪ بگذرد، به صندوق B
              چرخش می‌کند؛ اگر از −{(BAND * 100).toFixed(1)}٪ کمتر شود، به A. بین این باند
              پوزیشن نگه داشته می‌شود.
            </li>
            <li>
              خرید: بدون کارمزد. فروش: ۰.۲۴٪ روی کل مبلغ. ورود اولیه از حالت خنثی هیچ کارمزدی
              ندارد.
            </li>
            <li>
              «واحد معادل A» = ارزش پرتفوی ÷ قیمت صندوق A. اگر رو به رشد است، استراتژی از
              نگه‌داشتن A بهتر عمل کرده.
            </li>
            <li>
              تاریخچه‌ی معاملات و نمونه‌ها در مرورگر شما (localStorage) ذخیره می‌شود.
            </li>
          </ul>
        </details>
      </main>
    </div>
  );
}

function PriceRow({ prices }: { prices: Record<string, { last?: number; error?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {ALL_SYMBOLS.map((sym) => {
        const p = prices[sym];
        return (
          <div key={sym} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{sym}</div>
            <div className="text-lg font-semibold mt-1">
              {p?.last ? fmtNum(p.last, 0) : p?.error ? "!" : "…"}
            </div>
            {p?.error && (
              <div className="text-xs text-destructive mt-1 truncate">{p.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PairCard({
  cfg,
  state,
  onReset,
}: {
  cfg: PairConfig;
  state: PairState | undefined;
  onReset: () => void;
}) {
  const info = useMemo(() => {
    if (!state) return null;
    const last = state.samples[state.samples.length - 1];
    const ma = computeMA(state.samples);
    const dev = ma && last ? last.ratio / ma - 1 : null;
    const sig = evaluateSignal(state);
    const value = currentPortfolioValue(state);
    const pnl = value - state.startCapital;
    const pnlPct = pnl / state.startCapital;
    const eqA = equivalentUnitsA(state);
    const eqGrowth = eqA && state.startUnitsA ? eqA / state.startUnitsA - 1 : null;
    return { last, ma, dev, sig, value, pnl, pnlPct, eqA, eqGrowth };
  }, [state]);

  if (!state || !info) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">در حال بارگذاری {cfg.label}…</div>
      </div>
    );
  }

  const sigLabel =
    info.sig === "buyA"
      ? `چرخش به ${cfg.symbolA}`
      : info.sig === "buyB"
        ? `چرخش به ${cfg.symbolB}`
        : info.sig === "hold"
          ? "نگهداری پوزیشن فعلی"
          : `منتظر ${MA_WINDOW} نمونه (${state.samples.length}/${MA_WINDOW})`;

  const sigColor =
    info.sig === "buyA" || info.sig === "buyB"
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : info.sig === "hold"
        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">{cfg.label}</h2>
          <div className="text-xs text-muted-foreground mt-0.5">
            پوزیشن فعلی:{" "}
            {state.holding === "A"
              ? cfg.symbolA
              : state.holding === "B"
                ? cfg.symbolB
                : "خنثی (هنوز وارد نشده)"}
            {state.holding && ` • ${fmtNum(state.units, 4)} واحد`}
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm(`ریست کامل جفت ${cfg.label}؟ همه‌ی معاملات و نمونه‌ها پاک می‌شوند.`))
              onReset();
          }}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          ریست
        </button>
      </div>

      <div className={`rounded-md border px-3 py-2 text-sm font-medium ${sigColor}`}>
        سیگنال: {sigLabel}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Ratio" value={fmtNum(info.last?.ratio, 6)} />
        <Stat label={`MA${MA_WINDOW}`} value={fmtNum(info.ma, 6)} />
        <Stat label="انحراف" value={fmtPct(info.dev)} />
        <Stat
          label="نمونه‌ها"
          value={`${state.samples.length}`}
        />
        <Stat label="ارزش پرتفوی" value={fmtToman(info.value)} />
        <Stat
          label="سود/زیان"
          value={`${fmtToman(info.pnl)} (${fmtPct(info.pnlPct, 2)})`}
          tone={info.pnl >= 0 ? "pos" : "neg"}
        />
        <Stat
          label={`واحد معادل ${cfg.symbolA}`}
          value={fmtNum(info.eqA, 4)}
        />
        <Stat
          label="رشد واحدی"
          value={fmtPct(info.eqGrowth, 2)}
          tone={
            info.eqGrowth == null ? undefined : info.eqGrowth >= 0 ? "pos" : "neg"
          }
        />
      </div>

      {state.trades.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {state.trades.length.toLocaleString("fa-IR")} معامله‌ی ثبت‌شده
          </summary>
          <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">زمان</th>
                  <th className="p-2 text-right">به</th>
                  <th className="p-2 text-right">قیمت فروش</th>
                  <th className="p-2 text-right">قیمت خرید</th>
                  <th className="p-2 text-right">کارمزد</th>
                  <th className="p-2 text-right">سرمایه</th>
                </tr>
              </thead>
              <tbody>
                {[...state.trades].reverse().map((tr, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{fmtTime(tr.t)}</td>
                    <td className="p-2">
                      {tr.to === "A" ? cfg.symbolA : cfg.symbolB}
                    </td>
                    <td className="p-2">{tr.sellPrice ? fmtNum(tr.sellPrice, 0) : "—"}</td>
                    <td className="p-2">{fmtNum(tr.buyPrice, 0)}</td>
                    <td className="p-2">{fmtNum(tr.commission, 0)}</td>
                    <td className="p-2">{fmtNum(tr.newCapital, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 font-mono text-sm ${
          tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
