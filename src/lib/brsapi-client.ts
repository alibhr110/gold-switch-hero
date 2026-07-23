// Client-side BrsApi fetcher. Called from the user's browser (Iranian IP)
// because BrsApi rejects requests from Cloudflare Workers (401/geo-blocked).

const BRSAPI_KEY = "BtUXZHavdD6mwHaTiAKEdtebvziVHFLs";

const norm = (s: string) =>
  (s ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, "").trim();

export type BrsQuote = {
  last?: number;
  close?: number;
  bid?: number;
  ask?: number;
  time?: string;
  error?: string;
};

export type BrsResult = {
  prices: Record<string, BrsQuote>;
  fetchedAt: number;
};

async function fetchAllSymbols(): Promise<any[]> {
  const url = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${encodeURIComponent(BRSAPI_KEY)}&type=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (!res.ok) throw new Error(`BrsApi HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return Array.isArray(json) ? json : (json?.data ?? []);
}

export async function getBrsPricesClient(symbols: string[]): Promise<BrsResult> {
  const rows = await fetchAllSymbols();
  const wanted = new Set(symbols.map(norm));
  const byName = new Map<string, any>();
  for (const r of rows) {
    const name = norm(r?.l18 ?? "");
    if (wanted.has(name) && !byName.has(name)) byName.set(name, r);
  }
  const out: Record<string, BrsQuote> = {};
  for (const sym of symbols) {
    const r = byName.get(norm(sym));
    if (!r) {
      out[sym] = { error: "نماد یافت نشد" };
      continue;
    }
    out[sym] = {
      last: Number(r.pl) || undefined,
      close: Number(r.pc) || undefined,
      bid: Number(r.pd1) || undefined,
      ask: Number(r.po1) || undefined,
      time: r.time,
    };
  }
  return { prices: out, fetchedAt: Date.now() };
}
