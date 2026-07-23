// دریافت قیمت مستقیماً از مرورگر (چون TSETMC روی IP ایران است و از Cloudflare Workers قابل دسترسی نیست)

const norm = (s: string) =>
  (s ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, "").trim();

const codeCache = new Map<string, string>();

// اگر مرورگر با CORS مشکل داشت، از این پروکسی‌ها به‌ترتیب استفاده می‌شود
const PROXIES = [
  (u: string) => u, // مستقیم
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

let workingProxy = 0;

async function fetchJson(path: string): Promise<any> {
  const base = `https://cdn.tsetmc.com${path}`;
  let lastErr: any;
  for (let i = 0; i < PROXIES.length; i++) {
    const idx = (workingProxy + i) % PROXIES.length;
    try {
      const res = await fetch(PROXIES[idx](base), {
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      workingProxy = idx;
      return j;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

async function resolveInsCode(symbol: string): Promise<string | null> {
  if (codeCache.has(symbol)) return codeCache.get(symbol)!;
  const json = await fetchJson(`/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`);
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
  const json = await fetchJson(`/api/ClosingPrice/GetClosingPriceInfo/${insCode}`);
  const info = json?.closingPriceInfo;
  if (!info) throw new Error("no price info");
  return { last: Number(info.pDrCotVal), close: Number(info.pClosing) };
}

async function fetchBestLimits(insCode: string) {
  try {
    const json = await fetchJson(`/api/BestLimits/${insCode}`);
    const rows: any[] = json?.bestLimits ?? [];
    const row1 = rows.find((r) => Number(r.number) === 1) ?? rows[0];
    if (!row1) return { bid: 0, ask: 0 };
    return { bid: Number(row1.pMeDem) || 0, ask: Number(row1.pMeOf) || 0 };
  } catch {
    return { bid: 0, ask: 0 };
  }
}

export async function getSymbolPricesClient(symbols: string[]) {
  const out: Record<
    string,
    { insCode?: string; last?: number; close?: number; bid?: number; ask?: number; error?: string }
  > = {};
  await Promise.all(
    symbols.map(async (sym) => {
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
}
