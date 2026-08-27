// موتور استراتژی چرخش بین چند صندوق (۶ صندوق) — سمت سرور
// در هر گام، برای صندوقی که در اختیار داریم (H)، انحراف نسبت H/X از میانگین
// متحرک آن نسبت برای همه‌ی صندوق‌های دیگر محاسبه می‌شود؛ اگر بزرگ‌تر از باند بود،
// به صندوقی که بیشترین انحراف مثبت را دارد می‌چرخیم.

export type Quote = { bid?: number | null; ask?: number | null; last?: number | null };

export function midPrice(q: Quote | undefined, useBidAsk: boolean): number | null {
  if (!q) return null;
  if (useBidAsk && q.bid && q.ask) return (Number(q.bid) + Number(q.ask)) / 2;
  return q.last ? Number(q.last) : null;
}
export function buyPriceOf(q: Quote | undefined, useBidAsk: boolean): number {
  if (!q) return 0;
  if (useBidAsk && q.ask) return Number(q.ask);
  return Number(q.last ?? q.bid ?? 0);
}
export function sellPriceOf(q: Quote | undefined, useBidAsk: boolean): number {
  if (!q) return 0;
  if (useBidAsk && q.bid) return Number(q.bid);
  return Number(q.last ?? q.ask ?? 0);
}

/** انحراف نسبت held/cand از میانگین متحرک آن؛ null اگر داده کافی نباشد. */
export function deviation(
  seriesHeld: number[],
  seriesCand: number[],
  maWindow: number,
): number | null {
  const n = Math.min(seriesHeld.length, seriesCand.length);
  if (n < maWindow) return null;
  const h = seriesHeld.slice(-maWindow);
  const c = seriesCand.slice(-maWindow);
  let sum = 0;
  for (let i = 0; i < maWindow; i++) sum += h[i]! / c[i]!;
  const ma = sum / maWindow;
  if (!ma) return null;
  const last = h[maWindow - 1]! / c[maWindow - 1]!;
  return last / ma - 1;
}

export async function runMultiRotation(
  db: any,
  priceMap: Map<string, Quote>,
  norm: (s: string) => string,
  now: Date,
) {
  const nowIso = now.toISOString();
  const { data: state } = await db.from("multi_state").select("*").eq("id", "main").maybeSingle();
  if (!state) return { skipped: "no state" };

  const funds: string[] = state.funds ?? [];
  const useBidAsk: boolean = state.use_bid_ask;

  const quotes = new Map<string, Quote>();
  for (const f of funds) {
    const q = priceMap.get(norm(f));
    if (q) quotes.set(f, q);
  }

  // ثبت نمونه‌ی جدید در صورت رسیدن فاصله‌ی زمانی
  const { data: lastRow } = await db
    .from("fund_samples")
    .select("t")
    .order("t", { ascending: false })
    .limit(1)
    .maybeSingle();
  const elapsed = lastRow ? now.getTime() - new Date(lastRow.t).getTime() : Infinity;
  const tolerance = Math.min(60, state.sample_interval_sec * 0.2) * 1000;
  const shouldSample = elapsed >= state.sample_interval_sec * 1000 - tolerance;

  let sampleAdded = false;
  if (shouldSample) {
    const rows = funds
      .map((f) => ({ symbol: f, t: nowIso, price: midPrice(quotes.get(f), useBidAsk) }))
      .filter((r) => r.price != null);
    if (rows.length) {
      const { error } = await db.from("fund_samples").insert(rows);
      if (!error) sampleAdded = true;
    }
  }

  // سری قیمت هر صندوق برای محاسبه‌ی MA
  const maWindow: number = state.ma_window;
  const series = new Map<string, number[]>();
  await Promise.all(
    funds.map(async (f) => {
      const { data } = await db
        .from("fund_samples")
        .select("t, price")
        .eq("symbol", f)
        .order("t", { ascending: false })
        .limit(maWindow);
      series.set(
        f,
        (data ?? []).map((r: any) => Number(r.price)).reverse(),
      );
    }),
  );

  const band = Number(state.band_pct) / 100;
  const fee = Number(state.fee_pct) / 100;

  const update: any = { last_updated: nowIso };
  let holding: string | null = state.holding;
  let units = Number(state.units);
  let capital = Number(state.cash_capital);
  let startUnitsRef = Number(state.start_units_ref);
  let rotatedTo: string | null = null;
  let bestDev: number | null = null;

  // ورود اولیه
  if (!holding) {
    const first = funds.find((f) => buyPriceOf(quotes.get(f), useBidAsk) > 0);
    if (first) {
      const bp = buyPriceOf(quotes.get(first), useBidAsk);
      const newUnits = capital / bp;
      await db.from("multi_trades").insert({
        state_id: "main",
        t: nowIso,
        from_fund: null,
        to_fund: first,
        sell_price: 0,
        buy_price: bp,
        units_sold: 0,
        gross_sale: capital,
        commission: 0,
        new_capital: capital,
        new_units: newUnits,
      });
      holding = first;
      units = newUnits;
      rotatedTo = first;
    }
  } else {
    // بررسی چرخش
    const heldSeries = series.get(holding) ?? [];
    let target: string | null = null;
    let maxDev = band;
    for (const cand of funds) {
      if (cand === holding) continue;
      const d = deviation(heldSeries, series.get(cand) ?? [], maWindow);
      if (d != null && d > maxDev) {
        maxDev = d;
        target = cand;
      }
    }
    if (target) {
      const sellPrice = sellPriceOf(quotes.get(holding), useBidAsk);
      const buyPrice = buyPriceOf(quotes.get(target), useBidAsk);
      if (sellPrice && buyPrice) {
        const gross = units * sellPrice;
        const commission = gross * fee;
        const newCapital = gross - commission;
        const newUnits = newCapital / buyPrice;
        await db.from("multi_trades").insert({
          state_id: "main",
          t: nowIso,
          from_fund: holding,
          to_fund: target,
          sell_price: sellPrice,
          buy_price: buyPrice,
          units_sold: units,
          gross_sale: gross,
          commission,
          new_capital: newCapital,
          new_units: newUnits,
          dev_pct: maxDev * 100,
        });
        holding = target;
        units = newUnits;
        capital = newCapital;
        rotatedTo = target;
        bestDev = maxDev;
      }
    }
  }

  // معیار واحد مرجع
  if (!startUnitsRef) {
    const pRef = buyPriceOf(quotes.get(state.ref_symbol), useBidAsk);
    if (pRef) startUnitsRef = Number(state.start_capital) / pRef;
  }

  update.holding = holding;
  update.units = units;
  update.cash_capital = capital;
  update.start_units_ref = startUnitsRef;
  await db.from("multi_state").update(update).eq("id", "main");

  return { sampleAdded, holding, rotatedTo, dev: bestDev };
}
