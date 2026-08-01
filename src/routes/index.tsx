import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getDashboard } from "@/lib/dashboard.functions";
import { PairCharts } from "@/components/PairCharts";
import { PairStatement } from "@/components/PairStatement";

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
      {
        property: "og:description",
        content:
          "داشبورد فارسی پایش لحظه‌ای ۴ جفت از صندوق‌های طلای ایران با قیمت‌های bid/ask، تولید سیگنال چرخش بر پایه MA و شبیه‌سازی معاملات با کارمزد واقعی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});


const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtToman = (n: number) => Math.round(n).toLocaleString("fa-IR") + " تومان";
const fmtPct = (n: number | null, d = 3) =>
  n == null ? "—" : (n * 100).toLocaleString("fa-IR", { maximumFractionDigits: d }) + "٪";
const fmtTime = (iso: string | null | undefined) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

function Dashboard() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    refetchInterval: 15_000,
  });

  const quoteMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["quotes"][number]>();
    if (data) for (const q of data.quotes) m.set(q.symbol, q);
    return m;
  }, [data]);

  const stateMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["states"][number]>();
    if (data) for (const s of data.states) m.set(s.pair_id, s);
    return m;
  }, [data]);

  const tradesByPair = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["trades"]>();
    if (data)
      for (const t of data.trades) {
        const arr = m.get(t.pair_id) ?? [];
        arr.push(t);
        m.set(t.pair_id, arr);
      }
    return m;
  }, [data]);

  const lastFetchTime = data
    ? data.states
        .map((s: { last_updated: string | null }) =>
          s.last_updated ? new Date(s.last_updated).getTime() : 0,
        )
        .reduce((a: number, b: number) => Math.max(a, b), 0) || 0
    : 0;
  const stale = lastFetchTime === 0 ? true : Date.now() - lastFetchTime > 10 * 60 * 1000;
  const pairs = data?.pairs ?? [];
  const samplesByPair = data?.samplesByPair ?? {};


  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">چرخش صندوق‌های طلای ایران</h1>
            <p className="text-sm text-muted-foreground mt-1">
              فوروارد تست سمت سرور • داده از VPS ایرانی هر ۵ دقیقه به سرور ارسال می‌شود.
            </p>
          </div>
          <div className="text-sm text-left">
            <div>
              وضعیت:{" "}
              <span className={stale ? "text-amber-500" : "text-emerald-500"}>
                {stale ? "قدیمی / بدون داده" : "به‌روز"}
              </span>
            </div>
            <div className="text-muted-foreground">
              آخرین به‌روزرسانی:{" "}
              {lastFetchTime ? fmtTime(new Date(lastFetchTime).toISOString()) : "—"}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <IngestSetupCard />
        <PriceRow pairs={pairs} quoteMap={quoteMap} />
        <div className="grid gap-6 md:grid-cols-2">
          {pairs.map((p: Pair) => (
            <PairCard
              key={p.id}
              pair={p}
              state={stateMap.get(p.id)}
              samples={samplesByPair[p.id] ?? []}

              trades={tradesByPair.get(p.id) ?? []}
              quoteA={quoteMap.get(p.symbol_a)}
              quoteB={quoteMap.get(p.symbol_b)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function IngestSetupCard() {
  const [open, setOpen] = useState(false);
  const endpoint = "https://project--9affff7f-b88e-47b6-8eca-297fb25ac298-dev.lovable.app/api/public/ingest";
  const script = `# کافیه این دو خط را با مقادیر خودت پر کنی
BRSAPI_KEY = "BtUXZHavdD6mwHaTiAKEdtebvziVHFLs"
INGEST_TOKEN = "YOUR_INGEST_TOKEN"

import time, requests

INGEST_URL = "${endpoint}"
SYMBOLS = ["مثقال", "عیار", "جواهر", "کهربا", "گنج"]

def norm(s): return s.replace("ي","ی").replace("ك","ک").strip()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fa,en;q=0.9",
    "Connection": "close",
}
URLS = [
    f"https://brsapi.ir/Api/Tsetmc/AllSymbols.php?key={BRSAPI_KEY}&type=1",
    f"https://api.brsapi.ir/Tsetmc/AllSymbols.php?key={BRSAPI_KEY}&type=1",
    f"http://api.brsapi.ir/Tsetmc/AllSymbols.php?key={BRSAPI_KEY}&type=1",
]

rows, last_err = None, None
s = requests.Session()
for attempt in range(3):
    for url in URLS:
        try:
            r = s.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            rows = r.json()
            break
        except Exception as e:
            last_err = f"{url.split('?')[0]} -> {e}"
            print("تلاش ناموفق:", last_err)
    if rows is not None:
        break
    time.sleep(5)

if rows is None:
    raise SystemExit("دریافت قیمت از BrsApi ناموفق بود: " + str(last_err))
if isinstance(rows, dict): rows = rows.get("data", [])

wanted = {norm(s) for s in SYMBOLS}
by_name = {}
for row in rows:
    name = norm(row.get("l18",""))
    if name in wanted and name not in by_name:
        by_name[name] = row

prices = {}
for s in SYMBOLS:
    row = by_name.get(norm(s))
    if not row: continue
    prices[s] = {
        "bid":  float(row.get("pd1") or 0) or None,
        "ask":  float(row.get("po1") or 0) or None,
        "last": float(row.get("pl")  or 0) or None,
    }

resp = requests.post(
    INGEST_URL,
    headers={"X-Ingest-Token": INGEST_TOKEN, "Content-Type": "application/json"},
    json={"prices": prices},
    timeout=30,
)
print(resp.status_code, resp.text[:300])
`;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        <span>🛰️ راه‌اندازی VPS ایرانی (قدم‌به‌قدم)</span>
        <span className="text-muted-foreground text-xs">{open ? "بستن" : "باز کردن"}</span>
      </button>
      {open && (
        <div className="border-t border-border p-4 space-y-5 text-sm">
          <div className="space-y-3 text-sm leading-7">
            <p>
              <strong>۱. VPS چیه؟</strong> یک کامپیوتر همیشه روشن در ایران. ما به آن می‌گوییم
              هر ۵ دقیقه قیمت‌ها را بخوان و به سرور ما بفرست.
            </p>
            <p>
              <strong>۲. یک دسترسی به نام SSH بخر / داشته باش.</strong> وقتی VPS را خریدی،
              فروشنده یک IP، یک نام کاربری (معمولاً root) و یک رمز به تو می‌دهد.
            </p>
            <p>
              <strong>۳. به VPS وصل شو.</strong> از روی ویندوز یا مک، برنامه‌ای به نام Terminal
              یا Command Prompt را باز کن و این دستور را بنویس:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">ssh root@IP_VPS</pre>
            <p>
              به جای <code>IP_VPS</code> همان IPای را که خریدی بنویس. سپس رمز را وارد کن.
            </p>
            <p>
              <strong>۴. یکبار پایتون و ابزارها را نصب کن.</strong> داخل VPS این را بنویس و Enter بزن:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">
              apt update && apt install -y python3 python3-pip cron && pip3 install requests
            </pre>
            <p>
              <strong>۵. فایل اسکریپت را بساز.</strong> این دستور را بنویس تا فایل باز شود:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">nano /root/gold_ingest.py</pre>
            <p>
              متن زیر را کپی کن و داخل آن بچسبان. فقط در خط دوم، به جای{" "}
              <code>YOUR_INGEST_TOKEN</code> مقدار توکن را بنویس. توکن در بخش{" "}
              <strong>Secrets / Environment Variables</strong> پروژه‌ات در Lovable ذخیره شده
              (نامش <code>INGEST_TOKEN</code> است). اگر نتوانستی آن را پیدا کنی، بگو تا کمکت کنم.
            </p>
            <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-[11px] font-mono leading-relaxed">
{script}
            </pre>
            <p>
              <strong>۶. فایل را ذخیره کن.</strong> کلیدهای Ctrl + X را بزن، سپس Y را بزن، بعد Enter.
            </p>
            <p>
              <strong>۷. یکبار تست کن.</strong> این را بنویس:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">python3 /root/gold_ingest.py</pre>
            <p>
              اگر عدد <strong>200</strong> را دیدی، یعنی همه چی درست است.
            </p>
            <p>
              <strong>۸. به crontab بگو هر ۵ دقیقه اجرا کند.</strong> این دستور را بنویس:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">crontab -e</pre>
            <p>این خط را در انتها اضافه کن:</p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">
              {`*/5 * * * * /usr/bin/python3 /root/gold_ingest.py >> /var/log/gold.log 2>&1`}
            </pre>
            <p>
              <strong>۹. تمام.</strong> از الان به بعد هر ۵ دقیقه یکبار VPS قیمت‌ها را می‌فرستد و
              داشبورد به‌روز می‌شود. برای دیدن لاگ:
            </p>
            <pre className="rounded bg-muted p-2 text-[11px] font-mono">tail -f /var/log/gold.log</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceRow({
  pairs,
  quoteMap,
}: {
  pairs: Array<{ symbol_a: string; symbol_b: string }>;
  quoteMap: Map<string, { bid: number | null; ask: number | null; last: number | null }>;
}) {
  const symbols = Array.from(
    new Set(pairs.flatMap((p) => [p.symbol_a, p.symbol_b])),
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {symbols.map((sym) => {
        const q = quoteMap.get(sym);
        return (
          <div key={sym} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{sym}</div>
            <div className="text-lg font-semibold mt-1">
              {q?.last ? fmtNum(q.last, 0) : "…"}
            </div>
            {q && (q.bid || q.ask) && (
              <div className="mt-1 flex justify-between text-[11px] font-mono">
                <span className="text-emerald-500">bid {fmtNum(q.bid, 0)}</span>
                <span className="text-rose-500">ask {fmtNum(q.ask, 0)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Pair = {
  id: string;
  symbol_a: string;
  symbol_b: string;
  label: string;
  ma_window: number;
  band_pct: number;
  fee_pct: number;
  start_capital: number;
  use_bid_ask: boolean;
};
type State = {
  pair_id: string;
  holding: string | null;
  units: number;
  cash_capital: number;
  start_units_a: number;
  last_bid_a: number | null;
  last_ask_a: number | null;
  last_last_a: number | null;
  last_bid_b: number | null;
  last_ask_b: number | null;
  last_last_b: number | null;
  last_updated: string | null;
};
type Trade = {
  id: number;
  pair_id: string;
  t: string;
  from_side: string;
  to_side: string;
  sell_price: number;
  buy_price: number;
  units_sold: number;
  gross_sale: number;
  commission: number;
  new_capital: number;
  new_units: number;
};
type Quote = { bid: number | null; ask: number | null; last: number | null };

function PairCard({
  pair,
  state,
  samples,
  trades,
  quoteA,
  quoteB,
}: {
  pair: Pair;
  state: State | undefined;
  samples: { t: string; ratio: number }[];
  trades: Trade[];
  quoteA: Quote | undefined;
  quoteB: Quote | undefined;
}) {
  const info = useMemo(() => {
    if (!state) return null;
    const mid = (q: Quote | undefined) => {
      if (!q) return null;
      if (pair.use_bid_ask && q.bid && q.ask) return (Number(q.bid) + Number(q.ask)) / 2;
      return q.last ?? null;
    };
    const a = mid(quoteA);
    const b = mid(quoteB);
    const lastRatio = a && b ? a / b : null;
    const window = samples.slice(-pair.ma_window);
    const ma =
      window.length >= pair.ma_window
        ? window.reduce((acc, s) => acc + s.ratio, 0) / window.length
        : null;
    const dev = ma && lastRatio ? lastRatio / ma - 1 : null;
    const band = Number(pair.band_pct) / 100;
    let sig: "buyA" | "buyB" | "hold" | "wait" = "wait";
    if (ma && dev != null) {
      if (dev > band) sig = "buyB";
      else if (dev < -band) sig = "buyA";
      else sig = "hold";
    }
    // Mark-to-market
    const sellPrice = (q: Quote | undefined) => {
      if (!q) return 0;
      if (pair.use_bid_ask && q.bid) return Number(q.bid);
      return Number(q.last ?? q.ask ?? 0);
    };
    let value = Number(state.cash_capital);
    if (state.holding === "A") value = Number(state.units) * sellPrice(quoteA);
    else if (state.holding === "B") value = Number(state.units) * sellPrice(quoteB);
    const pnl = value - Number(pair.start_capital);
    const pnlPct = pnl / Number(pair.start_capital);
    const paSell = sellPrice(quoteA);
    const eqA = paSell ? value / paSell : null;
    const eqGrowth =
      eqA && state.start_units_a ? eqA / Number(state.start_units_a) - 1 : null;
    return { lastRatio, ma, dev, sig, value, pnl, pnlPct, eqA, eqGrowth };
  }, [pair, state, samples, quoteA, quoteB]);

  if (!state || !info) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">در حال بارگذاری {pair.label}…</div>
      </div>
    );
  }

  const sigLabel =
    info.sig === "buyA"
      ? `چرخش به ${pair.symbol_a}`
      : info.sig === "buyB"
        ? `چرخش به ${pair.symbol_b}`
        : info.sig === "hold"
          ? "نگهداری پوزیشن فعلی"
          : `منتظر ${pair.ma_window} نمونه (${samples.length}/${pair.ma_window})`;

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
          <h2 className="text-lg font-bold">{pair.label}</h2>
          <div className="text-xs text-muted-foreground mt-0.5">
            پوزیشن فعلی:{" "}
            {state.holding === "A"
              ? pair.symbol_a
              : state.holding === "B"
                ? pair.symbol_b
                : "خنثی (هنوز وارد نشده)"}
            {state.holding && ` • ${fmtNum(Number(state.units), 4)} واحد`}
          </div>
        </div>
      </div>

      <div className={`rounded-md border px-3 py-2 text-sm font-medium ${sigColor}`}>
        سیگنال: {sigLabel}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Ratio" value={fmtNum(info.lastRatio, 6)} />
        <Stat label={`MA${pair.ma_window}`} value={fmtNum(info.ma, 6)} />
        <Stat label="انحراف" value={fmtPct(info.dev)} />
        <Stat label="نمونه‌ها" value={`${samples.length}`} />
        <Stat label="ارزش پرتفوی" value={fmtToman(info.value)} />
        <Stat
          label="سود/زیان"
          value={`${fmtToman(info.pnl)} (${fmtPct(info.pnlPct, 2)})`}
          tone={info.pnl >= 0 ? "pos" : "neg"}
        />
        <Stat label={`واحد معادل ${pair.symbol_a}`} value={fmtNum(info.eqA, 4)} />
        <Stat
          label="رشد واحدی"
          value={fmtPct(info.eqGrowth, 2)}
          tone={info.eqGrowth == null ? undefined : info.eqGrowth >= 0 ? "pos" : "neg"}
        />
      </div>

      {trades.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {trades.length.toLocaleString("fa-IR")} معامله‌ی ثبت‌شده
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
                {trades.map((tr) => (
                  <tr key={tr.id} className="border-t border-border">
                    <td className="p-2">{fmtTime(tr.t)}</td>
                    <td className="p-2">{tr.to_side === "A" ? pair.symbol_a : pair.symbol_b}</td>
                    <td className="p-2">{tr.sell_price ? fmtNum(tr.sell_price, 0) : "—"}</td>
                    <td className="p-2">{fmtNum(tr.buy_price, 0)}</td>
                    <td className="p-2">{fmtNum(tr.commission, 0)}</td>
                    <td className="p-2">{fmtNum(tr.new_capital, 0)}</td>
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
