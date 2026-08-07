import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

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


function isTehranMarketOpen(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const wd = String(parts["weekday"]);
  if (wd === "Thu" || wd === "Fri") return false;
  const mins = Number(parts["hour"]) * 60 + Number(parts["minute"]);
  return mins >= 720 && mins <= 1020;
}

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

  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => setMarketOpen(isTehranMarketOpen(new Date()));
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">چرخش صندوق‌های طلای ایران</h1>
            <p className="text-sm text-muted-foreground mt-1">
              فوروارد تست سمت سرور • فقط شنبه تا چهارشنبه، ۱۲:۰۰ تا ۱۷:۰۰ به وقت تهران ثبت می‌شود.
            </p>
          </div>
          <div className="text-sm text-left space-y-0.5">
            <div>
              بازار:{" "}
              <span
                className={
                  marketOpen == null
                    ? "text-muted-foreground"
                    : marketOpen
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                }
              >
                {marketOpen == null ? "—" : marketOpen ? "باز" : "بسته"}
              </span>
            </div>
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
  const script = `# فقط این خط را با توکن خودت پر کن
INGEST_TOKEN = "YOUR_INGEST_TOKEN"

# دریافت مستقیم از TSETMC (بدون نیاز به هیچ کلید API)
import time, re, requests

INGEST_URL = "${endpoint}"
SYMBOLS = ["مثقال", "عیار", "جواهر", "کهربا", "گنج"]

MAP = {"ك": "ک", "ي": "ی", "ى": "ی"}
def norm(s):
    s = str(s)
    for a, b in MAP.items():
        s = s.replace(a, b)
    return re.sub(r"\\s+", "", s).strip()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/plain, */*",
    "Accept-Language": "fa,en;q=0.9",
    "Connection": "close",
}
URLS = [
    "http://old.tsetmc.com/tsev2/data/MarketWatchPlus.aspx?h=0&r=0",
    "http://old.tsetmc.com/tsev2/data/MarketWatchInit.aspx?h=0&r=0",
    "https://old.tsetmc.com/tsev2/data/MarketWatchPlus.aspx?h=0&r=0",
]

parts, last_err = None, None
s = requests.Session()
for attempt in range(3):
    for url in URLS:
        try:
            r = s.get(url, headers=HEADERS, timeout=20, verify=False)
            r.raise_for_status()
            p = r.content.decode("utf-8", "ignore").split("@")
            if len(p) > 3:
                parts = p
                break
        except Exception as e:
            last_err = f"{url} -> {e}"
            print("تلاش ناموفق:", last_err)
    if parts:
        break
    time.sleep(5)

if not parts:
    raise SystemExit("دریافت داده از TSETMC ناموفق بود: " + str(last_err))

# ---- بخش ۳: قیمت‌های بازار ----
wanted = {norm(x) for x in SYMBOLS}
by_id, name_of = {}, {}
for row in parts[2].split(";"):
    c = row.split(",")
    if len(c) < 8:
        continue
    nm = norm(c[2])
    if nm in wanted and nm not in name_of.values():
        by_id[c[0]] = {"last": float(c[7] or 0) or None, "close": float(c[6] or 0) or None}
        name_of[c[0]] = nm

# ---- بخش ۴: دفتر سفارش (ردیف اول) ----
book = {}
for row in parts[3].split(";"):
    c = row.split(",")
    if len(c) < 6 or c[1] != "1" or c[0] not in by_id:
        continue
    book[c[0]] = {"bid": float(c[4] or 0) or None, "ask": float(c[5] or 0) or None}

prices = {}
for sid, nm in name_of.items():
    b = book.get(sid, {})
    prices[nm] = {
        "bid": b.get("bid"),
        "ask": b.get("ask"),
        "last": by_id[sid]["last"] or by_id[sid]["close"],
    }

print("نمادهای یافت‌شده:", list(prices.keys()))
if not prices:
    raise SystemExit("هیچ نمادی پیدا نشد")

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
  samples: { t: string; a: number; b: number; ratio: number }[];
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

      <details className="text-xs" open>
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          📈 نمودارها
        </summary>
        <div className="mt-3">
          <PairCharts
            samples={samples}
            trades={trades}
            maWindow={pair.ma_window}
            bandPct={Number(pair.band_pct)}
            symbolA={pair.symbol_a}
            symbolB={pair.symbol_b}
          />
        </div>
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          🧾 استیتمنت کامل ({trades.length.toLocaleString("fa-IR")} معامله)
        </summary>
        <div className="mt-3">
          <PairStatement
            trades={trades}
            symbolA={pair.symbol_a}
            symbolB={pair.symbol_b}
            startCapital={Number(pair.start_capital)}
            currentValue={info.value}
            startUnitsA={Number(state.start_units_a)}
            equivalentUnitsA={info.eqA}
          />
        </div>
      </details>

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
