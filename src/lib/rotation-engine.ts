// موتور استراتژی چرخش — سمت کاربر
// وضعیت هر جفت در localStorage ذخیره می‌شود.

export type Sample = { t: number; a: number; b: number; ratio: number };

export type Trade = {
  t: number;
  from: "A" | "B";
  to: "A" | "B";
  sellPrice: number;
  buyPrice: number;
  unitsSold: number;
  grossSale: number;
  commission: number;
  newCapital: number;
  newUnits: number;
};

export type PairState = {
  id: string;
  symbolA: string;
  symbolB: string;
  samples: Sample[]; // آخرین N نمونه (برای MA20)
  holding: "A" | "B" | null; // پوزیشن فعلی
  units: number; // تعداد واحد صندوقِ نگه‌داشته‌شده
  cashCapital: number; // سرمایه‌ی پایه (شروع) — برای گزارش
  startCapital: number;
  startUnitsA: number; // برای محاسبه‌ی «واحد معادل A»
  trades: Trade[];
  lastPriceA?: number;
  lastPriceB?: number;
};

export type PairConfig = { id: string; symbolA: string; symbolB: string; label: string };

export const PAIRS: PairConfig[] = [
  { id: "mesghal-ganj", symbolA: "مثقال", symbolB: "گنج", label: "مثقال / گنج" },
  { id: "ayar-ganj", symbolA: "عیار", symbolB: "گنج", label: "عیار / گنج" },
  { id: "java-ganj", symbolA: "جواهر", symbolB: "گنج", label: "جواهر / گنج" },
  { id: "kahroba-java", symbolA: "کهربا", symbolB: "جواهر", label: "کهربا / جواهر" },
];

export const ALL_SYMBOLS = Array.from(
  new Set(PAIRS.flatMap((p) => [p.symbolA, p.symbolB])),
);

export const MA_WINDOW = 20;
export const BAND = 0.004; // ۰.۴٪
export const FEE = 0.0024; // ۰.۲۴٪ کارمزد فروش
export const START_CAPITAL = 50_000_000; // ۵۰ میلیون تومان
export const SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // ۵ دقیقه — دوره نمونه‌گیری منطقی
export const POLL_INTERVAL_MS = 30_000; // هر ۳۰ ثانیه از سرور می‌گیریم
const MAX_SAMPLES = 500;

const KEY = (id: string) => `rot-pair-v1:${id}`;

export function loadPair(cfg: PairConfig): PairState {
  if (typeof window === "undefined") return freshPair(cfg);
  try {
    const raw = window.localStorage.getItem(KEY(cfg.id));
    if (raw) {
      const s = JSON.parse(raw) as PairState;
      // migration guards
      s.samples = s.samples ?? [];
      s.trades = s.trades ?? [];
      return s;
    }
  } catch {}
  return freshPair(cfg);
}

export function savePair(s: PairState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(s.id), JSON.stringify(s));
  } catch {}
}

export function resetPair(cfg: PairConfig): PairState {
  const s = freshPair(cfg);
  savePair(s);
  return s;
}

function freshPair(cfg: PairConfig): PairState {
  return {
    id: cfg.id,
    symbolA: cfg.symbolA,
    symbolB: cfg.symbolB,
    samples: [],
    holding: null,
    units: 0,
    cashCapital: START_CAPITAL,
    startCapital: START_CAPITAL,
    startUnitsA: 0,
    trades: [],
  };
}

/** نمونه‌ی جدید را اضافه می‌کند اگر حداقل SAMPLE_INTERVAL_MS از آخرین نمونه گذشته باشد. */
export function addSample(s: PairState, a: number, b: number, now: number): boolean {
  s.lastPriceA = a;
  s.lastPriceB = b;
  const last = s.samples[s.samples.length - 1];
  if (last && now - last.t < SAMPLE_INTERVAL_MS) return false;
  s.samples.push({ t: now, a, b, ratio: a / b });
  if (s.samples.length > MAX_SAMPLES) s.samples.splice(0, s.samples.length - MAX_SAMPLES);
  return true;
}

export function computeMA(samples: Sample[], window = MA_WINDOW): number | null {
  if (samples.length < window) return null;
  const slice = samples.slice(-window);
  return slice.reduce((acc, s) => acc + s.ratio, 0) / slice.length;
}

export function evaluateSignal(
  s: PairState,
  band = BAND,
): "buyA" | "buyB" | "hold" | "wait" {
  const ma = computeMA(s.samples);
  const last = s.samples[s.samples.length - 1];
  if (!ma || !last) return "wait";
  const dev = last.ratio / ma - 1;
  if (dev > band) return "buyB"; // نسبت بالاست → A گران است → به B رو
  if (dev < -band) return "buyA";
  return "hold";
}

/** اجرای معامله در قیمت لحظه‌ای. اولین ورود از حالت flat کارمزد ندارد. */
export function executeSignal(s: PairState, priceA: number, priceB: number, now: number) {
  const sig = evaluateSignal(s);
  if (sig === "wait" || sig === "hold") return;
  const target: "A" | "B" = sig === "buyA" ? "A" : "B";
  if (s.holding === target) return;

  // مقداردهی اولیه‌ی واحد معادل A
  if (s.startUnitsA === 0) s.startUnitsA = s.startCapital / priceA;

  const sellPrice = s.holding === "A" ? priceA : s.holding === "B" ? priceB : 0;
  const buyPrice = target === "A" ? priceA : priceB;

  let saleAmount: number;
  let commission: number;
  let newCapital: number;

  if (s.holding === null) {
    // ورود اولیه، خرید مجانی، بدون فروش
    saleAmount = s.cashCapital;
    commission = 0;
    newCapital = s.cashCapital;
  } else {
    saleAmount = s.units * sellPrice;
    commission = saleAmount * FEE;
    newCapital = saleAmount - commission;
  }
  const newUnits = newCapital / buyPrice;

  s.trades.push({
    t: now,
    from: s.holding ?? target,
    to: target,
    sellPrice,
    buyPrice,
    unitsSold: s.units,
    grossSale: saleAmount,
    commission,
    newCapital,
    newUnits,
  });

  s.holding = target;
  s.units = newUnits;
  s.cashCapital = newCapital;
}

export function currentPortfolioValue(s: PairState): number {
  if (!s.holding) return s.cashCapital;
  const p = s.holding === "A" ? s.lastPriceA : s.lastPriceB;
  if (!p) return s.cashCapital;
  return s.units * p;
}

export function equivalentUnitsA(s: PairState): number | null {
  if (!s.lastPriceA) return null;
  return currentPortfolioValue(s) / s.lastPriceA;
}
