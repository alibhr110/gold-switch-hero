import * as XLSX from "xlsx";

export type ExportTrade = {
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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function exportTradesToExcel(opts: {
  trades: ExportTrade[];
  label: string;
  symbolA: string;
  symbolB: string;
  startCapital: number;
  currentValue: number;
  startUnitsA: number;
  equivalentUnitsA: number | null;
}) {
  const {
    trades,
    label,
    symbolA,
    symbolB,
    startCapital,
    currentValue,
    startUnitsA,
    equivalentUnitsA,
  } = opts;

  const side = (s: string) => (s === "A" ? symbolA : s === "B" ? symbolB : "نقد");
  const ordered = [...trades].sort(
    (x, y) => new Date(x.t).getTime() - new Date(y.t).getTime(),
  );

  let prev = Number(startCapital);
  const rows = ordered.map((tr, i) => {
    const equity = Number(tr.new_capital);
    const change = equity - prev;
    prev = equity;
    return {
      "#": i + 1,
      زمان: fmtDate(tr.t),
      از: side(tr.from_side),
      به: side(tr.to_side),
      "قیمت فروش (bid)": Number(tr.sell_price),
      "قیمت خرید (ask)": Number(tr.buy_price),
      "واحد فروخته‌شده": Number(tr.units_sold),
      "مبلغ ناخالص": Number(tr.gross_sale),
      کارمزد: Number(tr.commission),
      "سرمایه پس از معامله": equity,
      "واحد جدید": Number(tr.new_units),
      "تغییر سرمایه": change,
    };
  });

  const unitProfit =
    equivalentUnitsA && startUnitsA ? equivalentUnitsA / startUnitsA - 1 : null;

  const summary = [
    { شرح: "جفت صندوق", مقدار: label },
    { شرح: "سرمایه اولیه (تومان)", مقدار: Number(startCapital) },
    { شرح: "ارزش فعلی (تومان)", مقدار: Number(currentValue) },
    { شرح: `واحد اولیه ${symbolA}`, مقدار: Number(startUnitsA) },
    { شرح: `واحد فعلی معادل ${symbolA}`, مقدار: equivalentUnitsA ?? "—" },
    {
      شرح: "سود واحدی (٪)",
      مقدار: unitProfit == null ? "—" : Number((unitProfit * 100).toFixed(4)),
    },
    { شرح: "تعداد معامله", مقدار: rows.length },
    {
      شرح: "مجموع کارمزد (تومان)",
      مقدار: rows.reduce((a, r) => a + Number(r["کارمزد"]), 0),
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "خلاصه");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "معاملات");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `trades-${label.replace(/[\\/\s]+/g, "-")}-${stamp}.xlsx`);
}
