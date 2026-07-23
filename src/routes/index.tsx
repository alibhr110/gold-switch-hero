import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSymbolPricesClient } from "@/lib/tse-client";
import {
  ALL_SYMBOLS,
  DEFAULT_SETTINGS,
  PAIRS,
  addSample,
  computeMA,
  currentPortfolioValue,
  equivalentUnitsA,
  evaluateSignal,
  executeSignal,
  loadPair,
  loadSettings,
  resetPair,
  savePair,
  saveSettings,
  type PairConfig,
  type PairState,
  type PriceQuote,
  type Settings,
} from "@/lib/rotation-engine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "چرخش صندوق‌های طلا — سیگنال لحظه‌ای و بک‌تست مجازی" },
      {
        name: "description",
        content:
          "داشبورد فارسی پایش لحظه‌ای ۴ جفت از صندوق‌های طلای ایران با قیمت‌های bid/ask، تولید سیگنال چرخش بر پایه MA و شبیه‌سازی معاملات با کارمزد واقعی.",
      },
      { property: "og:title", content: "چرخش صندوق‌های طلا — سیگنال لحظه‌ای و بک‌تست مجازی" },
      { property: "og:description", content: "داشبورد فارسی پایش لحظه‌ای ۴ جفت از صندوق‌های طلای ایران با قیمت‌های bid/ask، تولید سیگنال چرخش بر پایه MA و شبیه‌سازی معاملات با کارمزد واقعی." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const fmtNum = (n: number | undefined | null, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtToman = (n: number) => Math.round(n).toLocaleString("fa-IR") + " تومان";
const fmtPct = (n: number | null, d = 3) =>
  n == null ? "—" : (n * 100).toLocaleString("fa-IR", { maximumFractionDigits: d }) + "٪";
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Dashboard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [states, setStates] = useState<Record<string, PairState>>({});
  const [prices, setPrices] = useState<Record<string, PriceQuote & { error?: string }>>({});
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "fetching" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const running = useRef(false);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const st = loadSettings();
    setSettings(st);
    settingsRef.current = st;
    const initial: Record<string, PairState> = {};
    for (const p of PAIRS) initial[p.id] = loadPair(p, st.startCapital);
    setStates(initial);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const fetchOnce = async () => {
    if (running.current) return;
    running.current = true;
    setStatus("fetching");
    try {
      const res = await getSymbolPricesClient(ALL_SYMBOLS);
      setPrices(res.prices as any);
      setLastFetch(res.fetchedAt);
      const now = res.fetchedAt;
      const st = settingsRef.current;
      setStates((prev) => {
        const next: Record<string, PairState> = { ...prev };
        for (const p of PAIRS) {
          const s = next[p.id] ?? loadPair(p, st.startCapital);
          const qa = (res.prices as any)[p.symbolA] as PriceQuote | undefined;
          const qb = (res.prices as any)[p.symbolB] as PriceQuote | undefined;
          if (qa && qb) {
            addSample(s, qa, qb, now, st);
            executeSignal(s, now, st);
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

  useEffect(() => {
    fetchOnce();
    const clockId = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(clockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(fetchOnce, settings.pollIntervalSec * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pollIntervalSec]);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">چرخش صندوق‌های طلای ایران</h1>
            <p className="text-sm text-muted-foreground mt-1">
              فوروارد تست زنده با قیمت‌های {settings.useBidAsk ? "bid/ask" : "آخرین معامله"} • MA
              {settings.maWindow} • باند {settings.bandPct}٪ • کارمزد فروش {settings.feePct}٪
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
              آخرین دریافت: {lastFetch ? fmtTime(lastFetch) : "—"} • ساعت: {fmtTime(Date.now())}
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
        <SettingsPanel
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            saveSettings(s);
          }}
        />
        <PriceRow prices={prices} useBidAsk={settings.useBidAsk} />
        <div className="grid gap-6 md:grid-cols-2">
          {PAIRS.map((p) => (
            <PairCard
              key={p.id}
              cfg={p}
              state={states[p.id]}
              settings={settings}
              onReset={() => {
                const s = resetPair(p, settings.startCapital);
                setStates((prev) => ({ ...prev, [p.id]: s }));
              }}
            />
          ))}
        </div>

        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">راهنمای سریع منطق</summary>
          <ul className="mt-3 space-y-2 text-muted-foreground list-disc pr-5">
            <li>
              هر {settings.pollIntervalSec} ثانیه قیمت لحظه‌ای (bid/ask ردیف اول دفتر سفارش) از
              TSETMC خوانده می‌شود.
            </li>
            <li>
              هر {Math.round(settings.sampleIntervalSec / 60)} دقیقه یک نمونه‌ی جدید به سری
              Ratio اضافه می‌شود (Ratio از mid = (bid+ask)/2 حساب می‌شود اگر bid/ask فعال باشد).
            </li>
            <li>
              اگر انحراف Ratio از MA{settings.maWindow} از +{settings.bandPct}٪ بگذرد، به B
              چرخش می‌کند؛ اگر از −{settings.bandPct}٪ کمتر شود، به A. بین این باند پوزیشن نگه
              داشته می‌شود.
            </li>
            <li>
              خرید در قیمت <b>ask</b>، فروش در قیمت <b>bid</b>. کارمزد {settings.feePct}٪ فقط
              روی فروش. ورود اولیه از حالت خنثی کارمزد ندارد.
            </li>
            <li>
              ارزش پرتفوی «مارک‌توـ‌مارکت» است: با bid فعلی (قیمتی که واقعاً می‌شود فروخت) محاسبه
              می‌شود.
            </li>
            <li>تنظیمات و همه‌ی معاملات در مرورگر شما (localStorage) ذخیره می‌شوند.</li>
          </ul>
        </details>
      </main>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Settings>(settings);
  useEffect(() => setDraft(settings), [settings]);

  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        <span>⚙️ تنظیمات استراتژی</span>
        <span className="text-muted-foreground text-xs">{open ? "بستن" : "باز کردن"}</span>
      </button>
      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumField
              label="پنجره‌ی میانگین متحرک (نمونه)"
              value={draft.maWindow}
              step={1}
              min={2}
              onChange={(v) => upd("maWindow", Math.max(2, Math.round(v)))}
            />
            <NumField
              label="باند انحراف (٪)"
              value={draft.bandPct}
              step={0.05}
              min={0}
              onChange={(v) => upd("bandPct", v)}
            />
            <NumField
              label="کارمزد فروش (٪)"
              value={draft.feePct}
              step={0.01}
              min={0}
              onChange={(v) => upd("feePct", v)}
            />
            <NumField
              label="سرمایه اولیه (تومان)"
              value={draft.startCapital}
              step={1_000_000}
              min={0}
              onChange={(v) => upd("startCapital", Math.round(v))}
            />
            <NumField
              label="فاصله‌ی نمونه‌گیری Ratio (ثانیه)"
              value={draft.sampleIntervalSec}
              step={30}
              min={30}
              onChange={(v) => upd("sampleIntervalSec", Math.round(v))}
            />
            <NumField
              label="بازه‌ی دریافت قیمت (ثانیه)"
              value={draft.pollIntervalSec}
              step={5}
              min={5}
              onChange={(v) => upd("pollIntervalSec", Math.round(v))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.useBidAsk}
              onChange={(e) => upd("useBidAsk", e.target.checked)}
            />
            استفاده از bid/ask (اسپرد واقعی بازار). اگر خاموش شود، از «آخرین معامله» استفاده
            می‌شود.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onChange(draft)}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              ذخیره‌ی تنظیمات
            </button>
            <button
              onClick={() => {
                setDraft(DEFAULT_SETTINGS);
                onChange(DEFAULT_SETTINGS);
              }}
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              بازگشت به پیش‌فرض
            </button>
            <span className="text-xs text-muted-foreground self-center">
              توجه: تغییر «سرمایه‌ی اولیه» فقط برای جفت‌هایی اثر می‌گذارد که ریست شوند.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
      />
    </label>
  );
}

function PriceRow({
  prices,
  useBidAsk,
}: {
  prices: Record<string, PriceQuote & { error?: string }>;
  useBidAsk: boolean;
}) {
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
            {useBidAsk && (p?.bid || p?.ask) && (
              <div className="mt-1 flex justify-between text-[11px] font-mono">
                <span className="text-emerald-500">bid {fmtNum(p.bid, 0)}</span>
                <span className="text-rose-500">ask {fmtNum(p.ask, 0)}</span>
              </div>
            )}
            {p?.error && <div className="text-xs text-destructive mt-1 truncate">{p.error}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PairCard({
  cfg,
  state,
  settings,
  onReset,
}: {
  cfg: PairConfig;
  state: PairState | undefined;
  settings: Settings;
  onReset: () => void;
}) {
  const info = useMemo(() => {
    if (!state) return null;
    const last = state.samples[state.samples.length - 1];
    const ma = computeMA(state.samples, settings.maWindow);
    const dev = ma && last ? last.ratio / ma - 1 : null;
    const sig = evaluateSignal(state, settings);
    const value = currentPortfolioValue(state, settings.useBidAsk);
    const pnl = value - state.startCapital;
    const pnlPct = pnl / state.startCapital;
    const eqA = equivalentUnitsA(state, settings.useBidAsk);
    const eqGrowth = eqA && state.startUnitsA ? eqA / state.startUnitsA - 1 : null;
    return { last, ma, dev, sig, value, pnl, pnlPct, eqA, eqGrowth };
  }, [state, settings]);

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
          : `منتظر ${settings.maWindow} نمونه (${state.samples.length}/${settings.maWindow})`;

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
        <Stat label={`MA${settings.maWindow}`} value={fmtNum(info.ma, 6)} />
        <Stat label="انحراف" value={fmtPct(info.dev)} />
        <Stat label="نمونه‌ها" value={`${state.samples.length}`} />
        <Stat label="ارزش پرتفوی" value={fmtToman(info.value)} />
        <Stat
          label="سود/زیان"
          value={`${fmtToman(info.pnl)} (${fmtPct(info.pnlPct, 2)})`}
          tone={info.pnl >= 0 ? "pos" : "neg"}
        />
        <Stat label={`واحد معادل ${cfg.symbolA}`} value={fmtNum(info.eqA, 4)} />
        <Stat
          label="رشد واحدی"
          value={fmtPct(info.eqGrowth, 2)}
          tone={info.eqGrowth == null ? undefined : info.eqGrowth >= 0 ? "pos" : "neg"}
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
                  <th className="p-2 text-right">فروش (bid)</th>
                  <th className="p-2 text-right">خرید (ask)</th>
                  <th className="p-2 text-right">کارمزد</th>
                  <th className="p-2 text-right">سرمایه</th>
                </tr>
              </thead>
              <tbody>
                {[...state.trades].reverse().map((tr, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{fmtTime(tr.t)}</td>
                    <td className="p-2">{tr.to === "A" ? cfg.symbolA : cfg.symbolB}</td>
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
