import { createServerFn } from "@tanstack/react-start";

// Fetches Iranian gold-fund quotes via BrsApi (proxies TSETMC, callable from any IP).
// Docs: https://brsapi.ir/  — endpoint returns all ETFs; we filter by l18 (symbol).

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

export const getBrsPrices = createServerFn({ method: "GET" })
  .inputValidator((data: { symbols: string[] }) => data)
  .handler(async ({ data }) => {
    const key = process.env.BRSAPI_KEY;
    if (!key) throw new Error("BRSAPI_KEY تنظیم نشده است");
    const url = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${encodeURIComponent(key)}&type=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });
    if (!res.ok) throw new Error(`BrsApi HTTP ${res.status}`);
    const json = (await res.json()) as any;
    const rows: any[] = Array.isArray(json) ? json : (json?.data ?? []);

    const wanted = new Set(data.symbols.map(norm));
    const byName = new Map<string, any>();
    for (const r of rows) {
      const name = norm(r?.l18 ?? "");
      if (wanted.has(name) && !byName.has(name)) byName.set(name, r);
    }

    const out: Record<string, BrsQuote> = {};
    for (const sym of data.symbols) {
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
  });
