import { createServerFn } from "@tanstack/react-start";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fa,en;q=0.9",
};

const norm = (s: string) =>
  (s ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, "").trim();

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const codeCache = new Map<string, string>();

async function resolveInsCode(symbol: string): Promise<string | null> {
  if (codeCache.has(symbol)) return codeCache.get(symbol)!;
  const url = `http://cdn.tsetmc.com/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`;
  const json = await fetchJson(url);
  const list: any[] = json?.instrumentSearch ?? [];
  const target = norm(symbol);
  const match =
    list.find((x) => norm(x.lVal18AFC) === target && x.lastDate === 1) ||
    list.find((x) => norm(x.lVal18AFC) === target) ||
    list[0];
  const code = match?.insCode?.toString() ?? null;
  if (code) codeCache.set(symbol, code);
  return code;
}

async function fetchPrice(insCode: string) {
  const url = `http://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceInfo/${insCode}`;
  const json = await fetchJson(url);
  const info = json?.closingPriceInfo;
  if (!info) throw new Error("no price info");
  return {
    last: Number(info.pDrCotVal),
    close: Number(info.pClosing),
  };
}

async function fetchBestLimits(insCode: string) {
  // ردیف اول دفتر سفارش: pMeDem = بهترین بید، pMeOf = بهترین اَسک
  const url = `http://cdn.tsetmc.com/api/BestLimits/${insCode}`;
  try {
    const json = await fetchJson(url);
    const rows: any[] = json?.bestLimits ?? [];
    const row1 = rows.find((r) => Number(r.number) === 1) ?? rows[0];
    if (!row1) return { bid: 0, ask: 0 };
    return {
      bid: Number(row1.pMeDem) || 0,
      ask: Number(row1.pMeOf) || 0,
    };
  } catch {
    return { bid: 0, ask: 0 };
  }
}

export const getSymbolPrices = createServerFn({ method: "GET" })
  .inputValidator((d: { symbols: string[] }) => d)
  .handler(async ({ data }) => {
    const out: Record<
      string,
      {
        insCode?: string;
        last?: number;
        close?: number;
        bid?: number;
        ask?: number;
        error?: string;
      }
    > = {};
    await Promise.all(
      data.symbols.map(async (sym) => {
        try {
          const code = await resolveInsCode(sym);
          if (!code) {
            out[sym] = { error: "نماد یافت نشد" };
            return;
          }
          const [p, bl] = await Promise.all([fetchPrice(code), fetchBestLimits(code)]);
          out[sym] = { insCode: code, ...p, ...bl };
        } catch (e: any) {
          out[sym] = { error: e?.message ?? "خطا" };
        }
      }),
    );
    return { prices: out, fetchedAt: Date.now() };
  });
