import { useMemo } from "react";
import * as XLSX from "xlsx";

type Quote = { bid: number | null; ask: number | null; last: number | null };

export type MultiState = {
  id: string;
  funds: string[];
  ref_symbol: string;
  ma_window: number;
  band_pct: number;
  fee_pct: number;
  use_bid_ask: boolean;
  start_capital: number;
  holding: string | null;
  units: number;
  cash_capital: number;
  start_units_ref: number;
  last_updated: string | null;
};

export type MultiTrade = {
  id: number;
  t: string;
  from_fund: string | null;
  to_fund: string;
  sell_price: number;
  buy_price: number;
  units_sold: number;
  gross_sale: number;
  commission: number;
  new_capital: number;
  new_units: number;
  dev_pct: number | null;
};

const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtPct = (n: number | null, d = 2) =>
  n == null || !isFinite(n)
    ? "—"
    : (n * 100).toLocaleString("fa-IR", { maximumFractionDigits: d }) + "٪";
const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("fa-IR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function sellPriceOf(q: Quote | undefined, useBidAsk: boolean) {
  if (!q) return 0;
  if (useBidAsk && q.bid) return Number(q.bid);
  return Number(q.last ?? q.ask ?? 0);
}

export function MultiFundCard({
  state,
  trades,
  fundSeries,
  quoteMap,
}: {
  state: MultiState;
  trades: MultiTrade[];
  fundSeries: Record<string, { t: string; price: number }[]>;
  quoteMap: Map<string, Quote>;
}) {
  const useBidAsk = state.use_bid_ask;
  const funds = state.funds ?? [];

  const info = useMemo(() => {
    const value = state.holding
      ? Number(state.units) * sellPriceOf(quoteMap.get(state.holding), useBidAsk)
      : Number(state.cash_capital);
    const pRef = sellPriceOf(quoteMap.get(state.ref_symbol), useBidAsk);
    const eqRef = pRef ? value / pRef : null;
    const unitGrowth =
      eqRef && state.start_units_ref ? eqRef / Number(state.start_units_ref) - 1 : null;
    const pnl = value - Number(state.start_capital);

    // انحراف نسبت صندوق در اختیار به هر صندوق دیگر
    const devs: { fund: string; dev: number | null }[] = [];
    const held = state.holding;
    const heldSeries = held ? (fundSeries[held] ?? []) : [];
    for (const f of funds) {
      if (!held || f === held) continue;
      const cs = fundSeries[f] ?? [];
      const n = Math.min(heldSeries.length, cs.length);
      if (n < state.ma_window) {
        devs.push({ fund: f, dev: null });
        continue;
      }
      const h = heldSeries.slice(-state.ma_window);
      const c = cs.slice(-state.ma_window);
      let sum = 0;
      for (let i = 0; i < state.ma_window; i++) sum += h[i]!.price / c[i]!.price;
      const ma = sum / state.ma_window;
      const last = h[state.ma_window - 1]!.price / c[state.ma_window - 1]!.price;
      devs.push({ fund: f, dev: ma ? last / ma - 1 : null });
    }
    devs.sort((a, b) => (b.dev ?? -Infinity) - (a.dev ?? -Infinity));
    const band = Number(state.band_pct) / 100;
    const best = devs[0];
    const signal =
      !held || !best
        ? "wait"
        : best.dev == null
          ? "wait"
          : best.dev > band
            ? `چرخش به ${best.fund}`
            : "نگهداری";
    const sampleCount = held ? heldSeries.length : 0;
    return { value, eqRef, unitGrowth, pnl, devs, signal, sampleCount };
  }, [state, quoteMap, fundSeries, funds, useBidAsk]);

  const totalFees = trades.reduce((a, t) => a + Number(t.commission), 0);

  const exportExcel = () => {
    const ordered = [...trades].sort(
      (a, b) => new Date(a.t).getTime() - new Date(b.t).getTime(),
    );
    const rows = ordered.map((t, i) => ({
      "#": i + 1,
      زمان: fmtDT(t.t),
      از: t.from_fund ?? "نقد",
      به: t.to_fund,
      "قیمت فروش (bid)": Number(t.sell_price),
      "قیمت خرید (ask)": Number(t.buy_price),
      "واحد فروخته‌شده": Number(t.units_sold),
      "مبلغ ناخالص": Number(t.gross_sale),
      کارمزد: Number(t.commission),
      "سرمایه پس از معامله": Number(t.new_capital),
      "واحد جدید": Number(t.new_units),
      "انحراف (٪)": t.dev_pct == null ? "—" : Number(t.dev_pct),
    }));
    const summary = [
      { شرح: "استراتژی", مقدار: "چرخش بین ۶ صندوق" },
      { شرح: "صندوق‌ها", مقدار: funds.join(" / ") },
      { شرح: "سرمایه اولیه (تومان)", مقدار: Number(state.start_capital) },
      { شرح: "ارزش فعلی (تومان)", مقدار: Math.round(info.value) },
      { شرح: `واحد اولیه ${state.ref_symbol}`, مقدار: Number(state.start_units_ref) },
      { شرح: `واحد فعلی معادل ${state.ref_symbol}`, مقدار: info.eqRef ?? "—" },
      {
        شرح: "رشد واحدی (٪)",
        مقدار: info.unitGrowth == null ? "—" : Number((info.unitGrowth * 100).toFixed(4)),
      },
      { شرح: "تعداد چرخش", مقدار: rows.length },
      { شرح: "مجموع کارمزد (تومان)", مقدار: Math.round(totalFees) },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "خلاصه");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "چرخش‌ها");
    XLSX.writeFile(wb, `multi-fund-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <section className="rounded-lg border border-primary/40 bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">استراتژی چرخش بین ۶ صندوق</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {funds.join(" • ")} — در هر گام نسبت صندوق در اختیار به همه‌ی صندوق‌های دیگر
            بررسی می‌شود و به بیشترین انحراف مثبت (بالاتر از باند) چرخش انجام می‌شود.
          </p>
        </div>
        <button
          type="button"
          onClick={exportExcel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
        >
          ⬇ خروجی اکسل
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="پوزیشن فعلی" value={state.holding ?? "خنثی"} />
        <Stat label="واحد در اختیار" value={fmtNum(Number(state.units), 3)} />
        <Stat
          label={`واحد معادل ${state.ref_symbol}`}
          value={`${fmtNum(info.eqRef, 2)} / ${fmtNum(Number(state.start_units_ref), 2)}`}
        />
        <Stat
          label="سود واحدی"
          value={fmtPct(info.unitGrowth)}
          tone={
            info.unitGrowth == null ? undefined : info.unitGrowth >= 0 ? "up" : "down"
          }
        />
        <Stat label="ارزش فعلی" value={fmtNum(info.value, 0) + " تومان"} />
        <Stat label="سرمایه اولیه" value={fmtNum(Number(state.start_capital), 0)} />
        <Stat label="تعداد چرخش" value={fmtNum(trades.length, 0)} />
        <Stat label="مجموع کارمزد" value={fmtNum(totalFees, 0)} />
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="text-xs text-muted-foreground mb-2">
          سیگنال فعلی:{" "}
          <span className="font-semibold text-foreground">{info.signal}</span>
          {" • "}
          باند ±{Number(state.band_pct).toLocaleString("fa-IR")}٪ • MA
          {state.ma_window.toLocaleString("fa-IR")} • نمونه‌ها:{" "}
          {info.sampleCount.toLocaleString("fa-IR")}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {info.devs.map((d) => (
            <div key={d.fund} className="rounded border border-border bg-muted/40 p-2">
              <div className="text-[11px] text-muted-foreground">
                {state.holding} / {d.fund}
              </div>
              <div
                className={
                  "font-mono text-sm " +
                  (d.dev == null
                    ? "text-muted-foreground"
                    : d.dev > Number(state.band_pct) / 100
                      ? "text-amber-500"
                      : d.dev >= 0
                        ? "text-emerald-500"
                        : "text-rose-500")
                }
              >
                {d.dev == null ? "—" : fmtPct(d.dev, 3)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pl-2">#</th>
              <th className="py-1.5 pl-2">زمان</th>
              <th className="py-1.5 pl-2">از → به</th>
              <th className="py-1.5 pl-2">فروش</th>
              <th className="py-1.5 pl-2">خرید</th>
              <th className="py-1.5 pl-2">کارمزد</th>
              <th className="py-1.5 pl-2">سرمایه</th>
              <th className="py-1.5 pl-2">واحد جدید</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {trades.slice(0, 30).map((t, i) => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-1.5 pl-2">{trades.length - i}</td>
                <td className="py-1.5 pl-2">{fmtDT(t.t)}</td>
                <td className="py-1.5 pl-2 font-sans">
                  {t.from_fund ?? "نقد"} → {t.to_fund}
                </td>
                <td className="py-1.5 pl-2">{fmtNum(Number(t.sell_price), 0)}</td>
                <td className="py-1.5 pl-2">{fmtNum(Number(t.buy_price), 0)}</td>
                <td className="py-1.5 pl-2 text-rose-500">
                  {fmtNum(Number(t.commission), 0)}
                </td>
                <td className="py-1.5 pl-2">{fmtNum(Number(t.new_capital), 0)}</td>
                <td className="py-1.5 pl-2">{fmtNum(Number(t.new_units), 3)}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-muted-foreground font-sans">
                  هنوز چرخشی ثبت نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={
          "mt-0.5 text-sm font-semibold " +
          (tone === "up" ? "text-emerald-500" : tone === "down" ? "text-rose-500" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
