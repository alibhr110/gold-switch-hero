// موتور استراتژی چرخش — سمت کاربر
// از قیمت‌های bid/ask استفاده می‌شود (خرید در ask، فروش در bid).
// پارامترها از طریق getSettings() قابل تغییرند و در localStorage ذخیره می‌شوند.

export type Sample = { t: number; a: number; b: number; ratio: number };

export type Trade = {
  t: number;
  from: "A" | "B";
  to: "A" | "B";
  sellPrice: number; // bid صندوقی که فروخته شد
  buyPrice: number; // ask صندوقی که خریده شد
  unitsSold: number;
  grossSale: number;
  commission: number;
  newCapital: number;
  newUnits: number;
};

export type PriceQuote = {
  last?: number;
  bid?: number;
  ask?: number;
};

export type PairState = {
  id: string;
  symbolA: string;
  symbolB: string;
  samples: Sample[];
  holding: "A" | "B" | null;
  units: number;
  cashCapital: number;
  startCapital: number;
  startUnitsA: number;
  trades: Trade[];
  lastQuoteA?: PriceQuote;
  lastQuoteB?: PriceQuote;
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

// ---- تنظیمات قابل تغییر ----
export type Settings = {
  maWindow: number;
  bandPct: number; // درصد (مثلاً 0.4 برای ۰.۴٪)
  feePct: number; // درصد (مثلاً 0.24)
  startCapital: number;
  sampleIntervalSec: number;
  pollIntervalSec: number;
  useBidAsk: boolean; // اگر false، از last استفاده می‌کند
};

export const DEFAULT_SETTINGS: Settings = {
  maWindow: 20,
  bandPct: 0.4,
  feePct: 0.24,
  startCapital: 50_000_000,
  sampleIntervalSec: 300, // ۵ دقیقه
  pollIntervalSec: 30,
  useBidAsk: true,
};

const SETTINGS_KEY = "rot-settings-v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

const MAX_SAMPLES = 1000;
const KEY = (id: string) => `rot-pair-v2:${id}`;

export function loadPair(cfg: PairConfig, startCapital: number): PairState {
  if (typeof window === "undefined") return freshPair(cfg, startCapital);
  try {
    const raw = window.localStorage.getItem(KEY(cfg.id));
    if (raw) {
      const s = JSON.parse(raw) as PairState;
      s.samples = s.samples ?? [];
      s.trades = s.trades ?? [];
      return s;
    }
  } catch {}
  return freshPair(cfg, startCapital);
}

export function savePair(s: PairState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(s.id), JSON.stringify(s));
  } catch {}
}

export function resetPair(cfg: PairConfig, startCapital: number): PairState {
  const s = freshPair(cfg, startCapital);
  savePair(s);
  return s;
}

function freshPair(cfg: PairConfig, startCapital: number): PairState {
  return {
    id: cfg.id,
    symbolA: cfg.symbolA,
    symbolB: cfg.symbolB,
    samples: [],
    holding: null,
    units: 0,
    cashCapital: startCapital,
    startCapital,
    startUnitsA: 0,
    trades: [],
  };
}

/** قیمت مرجع برای محاسبه‌ی Ratio: میانگین bid/ask اگر موجود، وگرنه last. */
export function midPrice(q: PriceQuote | undefined, useBidAsk: boolean): number | null {
  if (!q) return null;
  if (useBidAsk && q.bid && q.ask) return (q.bid + q.ask) / 2;
  return q.last || null;
}

export function addSample(
  s: PairState,
  qa: PriceQuote,
  qb: PriceQuote,
  now: number,
  settings: Settings,
): boolean {
  s.lastQuoteA = qa;
  s.lastQuoteB = qb;
  const a = midPrice(qa, settings.useBidAsk);
  const b = midPrice(qb, settings.useBidAsk);
  if (!a || !b) return false;
  const last = s.samples[s.samples.length - 1];
  if (last && now - last.t < settings.sampleIntervalSec * 1000) return false;
  s.samples.push({ t: now, a, b, ratio: a / b });
  if (s.samples.length > MAX_SAMPLES) s.samples.splice(0, s.samples.length - MAX_SAMPLES);
  return true;
}

export function computeMA(samples: Sample[], window: number): number | null {
  if (samples.length < window) return null;
  const slice = samples.slice(-window);
  return slice.reduce((acc, s) => acc + s.ratio, 0) / slice.length;
}

export function evaluateSignal(
  s: PairState,
  settings: Settings,
): "buyA" | "buyB" | "hold" | "wait" {
  const ma = computeMA(s.samples, settings.maWindow);
  const last = s.samples[s.samples.length - 1];
  if (!ma || !last) return "wait";
  const dev = last.ratio / ma - 1;
  const band = settings.bandPct / 100;
  if (dev > band) return "buyB";
  if (dev < -band) return "buyA";
  return "hold";
}

/** قیمت خرید = ask هدف؛ قیمت فروش = bid موجودی. اگر bid/ask نداشتیم، از last استفاده می‌شود. */
function priceForBuy(q: PriceQuote | undefined, useBidAsk: boolean): number {
  if (!q) return 0;
  if (useBidAsk && q.ask) return q.ask;
  return q.last || q.bid || 0;
}
function priceForSell(q: PriceQuote | undefined, useBidAsk: boolean): number {
  if (!q) return 0;
  if (useBidAsk && q.bid) return q.bid;
  return q.last || q.ask || 0;
}

export function executeSignal(s: PairState, now: number, settings: Settings) {
  const sig = evaluateSignal(s, settings);
  if (sig === "wait" || sig === "hold") return;
  const target: "A" | "B" = sig === "buyA" ? "A" : "B";
  if (s.holding === target) return;

  const buyQuote = target === "A" ? s.lastQuoteA : s.lastQuoteB;
  const sellQuote =
    s.holding === "A" ? s.lastQuoteA : s.holding === "B" ? s.lastQuoteB : undefined;

  const buyPrice = priceForBuy(buyQuote, settings.useBidAsk);
  const sellPrice = sellQuote ? priceForSell(sellQuote, settings.useBidAsk) : 0;
  if (!buyPrice) return;
  if (s.holding !== null && !sellPrice) return;

  // مقداردهی اولیه‌ی واحد معادل A (بر مبنای mid یا ask A)
  if (s.startUnitsA === 0) {
    const pa = priceForBuy(s.lastQuoteA, settings.useBidAsk);
    if (pa) s.startUnitsA = s.startCapital / pa;
  }

  const fee = settings.feePct / 100;
  let saleAmount: number;
  let commission: number;
  let newCapital: number;

  if (s.holding === null) {
    saleAmount = s.cashCapital;
    commission = 0;
    newCapital = s.cashCapital;
  } else {
    saleAmount = s.units * sellPrice;
    commission = saleAmount * fee;
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

export function currentPortfolioValue(s: PairState, useBidAsk: boolean): number {
  if (!s.holding) return s.cashCapital;
  const q = s.holding === "A" ? s.lastQuoteA : s.lastQuoteB;
  // ارزیابی مارک‌ توـ مارکت: از bid (قیمت قابل فروش) استفاده می‌کنیم
  const p = priceForSell(q, useBidAsk);
  if (!p) return s.cashCapital;
  return s.units * p;
}

export function equivalentUnitsA(s: PairState, useBidAsk: boolean): number | null {
  const pa = priceForSell(s.lastQuoteA, useBidAsk);
  if (!pa) return null;
  return currentPortfolioValue(s, useBidAsk) / pa;
}
