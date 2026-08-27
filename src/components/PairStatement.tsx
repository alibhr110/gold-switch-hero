import { useMemo } from "react";

export type StatementTrade = {
  id: number;
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

const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d });
const fmtToman = (n: number) => Math.round(n).toLocaleString("fa-IR") + " تومان";
const fmtPct = (n: number | null, d = 2) =>
  n == null ? "—" : (n * 100).toLocaleString("fa-IR", { maximumFractionDigits: d }) + "٪";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fa-IR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PairStatement({
  trades,
  symbolA,
  symbolB,
  startCapital,
  currentValue,
  startUnitsA,
  equivalentUnitsA,
}: {
  trades: StatementTrade[];
  symbolA: string;
  symbolB: string;
  startCapital: number;
  currentValue: number;
  startUnitsA: number;
  equivalentUnitsA: number | null;
}) {
  // Oldest → newest for a running statement
  const rows = useMemo(() => {
    const ordered = [...trades].sort(
      (x, y) => new Date(x.t).getTime() - new Date(y.t).getTime(),
    );
    let prevCapital = Number(startCapital);
    return ordered.map((tr, i) => {
      const equity = Number(tr.new_capital);
      const change = equity - prevCapital;
      prevCapital = equity;
      return {
        ...tr,
        idx: i + 1,
        change,
        changePct: change / (equity - change || 1),
        cumPct: equity / Number(startCapital) - 1,
      };
    });
  }, [trades, startCapital]);

  const totalFees = rows.reduce((a, r) => a + Number(r.commission), 0);
  const wins = rows.filter((r) => r.change > 0).length;
  const losses = rows.filter((r) => r.change < 0).length;
  const pnl = currentValue - Number(startCapital);
  const unitAlpha =
    equivalentUnitsA && startUnitsA ? equivalentUnitsA / startUnitsA - 1 : null;
  const sideLabel = (s: string) => (s === "A" ? symbolA : s === "B" ? symbolB : "نقد");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="سرمایه اولیه" value={fmtToman(startCapital)} />
        <Metric label="ارزش فعلی" value={fmtToman(currentValue)} />
        <Metric
          label={`سود معاملات (واحدی ${symbolA})`}
          value={fmtPct(unitAlpha)}
          tone={unitAlpha == null ? undefined : unitAlpha >= 0 ? "pos" : "neg"}
        />
        <Metric
          label="سود/زیان ریالی (اطلاعاتی)"
          value={`${fmtToman(pnl)} (${fmtPct(pnl / Number(startCapital))})`}
          tone={pnl >= 0 ? "pos" : "neg"}
        />
        <Metric label="مجموع کارمزد" value={fmtToman(totalFees)} tone="neg" />
        <Metric label="تعداد معامله" value={fmtNum(rows.length, 0)} />
        <Metric label="سودده / زیان‌ده" value={`${fmtNum(wins, 0)} / ${fmtNum(losses, 0)}`} />
        <Metric
          label={`واحد ${symbolA}: اکنون / ابتدا`}
          value={`${fmtNum(equivalentUnitsA, 2)} / ${fmtNum(startUnitsA, 2)}`}
        />

      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">
          هنوز معامله‌ای ثبت نشده است.
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">زمان</th>
                <th className="p-2 text-right">از → به</th>
                <th className="p-2 text-right">فروش (bid)</th>
                <th className="p-2 text-right">خرید (ask)</th>
                <th className="p-2 text-right">واحد فروخته</th>
                <th className="p-2 text-right">ناخالص</th>
                <th className="p-2 text-right">کارمزد</th>
                <th className="p-2 text-right">سرمایه پس از معامله</th>
                <th className="p-2 text-right">واحد جدید</th>
                <th className="p-2 text-right">تغییر</th>
                <th className="p-2 text-right">بازده تجمعی</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2">{fmtNum(r.idx, 0)}</td>
                  <td className="p-2 whitespace-nowrap">{fmtDateTime(r.t)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {sideLabel(r.from_side)} ← {sideLabel(r.to_side)}
                  </td>
                  <td className="p-2">{r.sell_price ? fmtNum(r.sell_price, 0) : "—"}</td>
                  <td className="p-2">{fmtNum(r.buy_price, 0)}</td>
                  <td className="p-2">{fmtNum(r.units_sold, 3)}</td>
                  <td className="p-2">{fmtNum(r.gross_sale, 0)}</td>
                  <td className="p-2 text-destructive">{fmtNum(r.commission, 0)}</td>
                  <td className="p-2">{fmtNum(r.new_capital, 0)}</td>
                  <td className="p-2">{fmtNum(r.new_units, 3)}</td>
                  <td
                    className={`p-2 ${r.change >= 0 ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {fmtNum(r.change, 0)}
                  </td>
                  <td
                    className={`p-2 ${r.cumPct >= 0 ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {fmtPct(r.cumPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({
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
        className={`mt-0.5 font-mono text-xs ${
          tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
