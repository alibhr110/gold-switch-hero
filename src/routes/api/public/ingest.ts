import { createFileRoute } from "@tanstack/react-router";

// Normalize Persian characters and whitespace
const norm = (s: string) =>
  (s ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, "").trim();

type IncomingQuote = { bid?: number | null; ask?: number | null; last?: number | null };
type IngestBody = { prices: Record<string, IncomingQuote> };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ingest-Token",
} as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// ---- Iran market session gate: Sat–Wed, 12:00–17:00 Asia/Tehran ----
function tehranParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    weekday: String(parts["weekday"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
  };
}

function marketOpen(d: Date) {
  const { weekday, hour, minute } = tehranParts(d);
  // Iranian weekend: Thursday & Friday
  if (weekday === "Thu" || weekday === "Fri") return false;
  const mins = hour * 60 + minute;
  return mins >= 12 * 60 && mins <= 17 * 60;
}

function midPrice(q: { bid?: number | null; ask?: number | null; last?: number | null }, useBidAsk: boolean) {
  if (useBidAsk && q.bid && q.ask) return (q.bid + q.ask) / 2;
  return q.last ?? null;
}
function priceForBuy(q: any, useBidAsk: boolean) {
  if (useBidAsk && q?.ask) return Number(q.ask);
  return Number(q?.last ?? q?.bid ?? 0);
}
function priceForSell(q: any, useBidAsk: boolean) {
  if (useBidAsk && q?.bid) return Number(q.bid);
  return Number(q?.last ?? q?.ask ?? 0);
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const expected = process.env.INGEST_TOKEN;
        if (!expected) return json(500, { error: "INGEST_TOKEN not configured" });

        const provided =
          request.headers.get("x-ingest-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (provided !== expected) return json(401, { error: "Unauthorized" });

        let body: IngestBody;
        try {
          body = (await request.json()) as IngestBody;
        } catch {
          return json(400, { error: "Invalid JSON body" });
        }
        if (!body?.prices || typeof body.prices !== "object")
          return json(400, { error: "Missing 'prices' object" });

        // Normalize keys
        const priceMap = new Map<string, IncomingQuote>();
        for (const [k, v] of Object.entries(body.prices)) {
          priceMap.set(norm(k), {
            bid: v?.bid ?? null,
            ask: v?.ask ?? null,
            last: v?.last ?? null,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const nowIso = now.toISOString();
        const isOpen = marketOpen(now);

        // Upsert latest quotes for UI
        const quoteRows = Array.from(priceMap.entries()).map(([symbol, q]) => ({
          symbol,
          bid: q.bid,
          ask: q.ask,
          last: q.last,
          fetched_at: nowIso,
        }));
        if (quoteRows.length) {
          await supabaseAdmin.from("symbol_quotes").upsert(quoteRows, { onConflict: "symbol" });
        }

        if (!isOpen) {
          return json(200, {
            ok: true,
            at: nowIso,
            marketOpen: false,
            note: "بازار بسته است (شنبه تا چهارشنبه، ۱۲:۰۰ تا ۱۷:۰۰ به وقت تهران)",
            results: [],
          });
        }


        const { data: pairs, error: pairsErr } = await supabaseAdmin
          .from("pairs")
          .select("*");
        if (pairsErr) return json(500, { error: pairsErr.message });

        const results: any[] = [];

        for (const p of pairs ?? []) {
          const qa = priceMap.get(norm(p.symbol_a));
          const qb = priceMap.get(norm(p.symbol_b));
          if (!qa || !qb) {
            results.push({ pair: p.id, skipped: "missing quote" });
            continue;
          }
          const a = midPrice(qa, p.use_bid_ask);
          const b = midPrice(qb, p.use_bid_ask);
          if (!a || !b) {
            results.push({ pair: p.id, skipped: "no mid price" });
            continue;
          }

          // Load current state
          const { data: state } = await supabaseAdmin
            .from("pair_state")
            .select("*")
            .eq("pair_id", p.id)
            .maybeSingle();
          if (!state) continue;

          // Update last quotes on state
          const stateUpdate: any = {
            last_bid_a: qa.bid,
            last_ask_a: qa.ask,
            last_last_a: qa.last,
            last_bid_b: qb.bid,
            last_ask_b: qb.ask,
            last_last_b: qb.last,
            last_updated: nowIso,
          };

          // Should we add a new sample?
          const { data: lastSample } = await supabaseAdmin
            .from("samples")
            .select("t")
            .eq("pair_id", p.id)
            .order("t", { ascending: false })
            .limit(1)
            .maybeSingle();
          const elapsedMs = lastSample
            ? now.getTime() - new Date(lastSample.t).getTime()
            : Infinity;
          const shouldSample = elapsedMs >= p.sample_interval_sec * 1000;

          let sampleAdded = false;
          if (shouldSample) {
            const { error: sErr } = await supabaseAdmin
              .from("samples")
              .insert({ pair_id: p.id, t: nowIso, a, b, ratio: a / b });
            if (!sErr) sampleAdded = true;
          }

          // Evaluate signal on recent MA window (only if we have enough samples)
          const { data: recent } = await supabaseAdmin
            .from("samples")
            .select("ratio")
            .eq("pair_id", p.id)
            .order("t", { ascending: false })
            .limit(p.ma_window);
          const list = recent ?? [];
          let signal: "buyA" | "buyB" | "hold" | "wait" = "wait";
          if (list.length >= p.ma_window) {
            const ma = list.reduce((acc, r) => acc + Number(r.ratio), 0) / list.length;
            const lastRatio = a / b;
            const dev = lastRatio / ma - 1;
            const band = Number(p.band_pct) / 100;
            if (dev > band) signal = "buyB";
            else if (dev < -band) signal = "buyA";
            else signal = "hold";
          }

          // Execute switch if needed
          if (signal === "buyA" || signal === "buyB") {
            const target: "A" | "B" = signal === "buyA" ? "A" : "B";
            if (state.holding !== target) {
              const buyQ = target === "A" ? qa : qb;
              const sellQ =
                state.holding === "A" ? qa : state.holding === "B" ? qb : undefined;
              const buyPrice = priceForBuy(buyQ, p.use_bid_ask);
              const sellPrice = sellQ ? priceForSell(sellQ, p.use_bid_ask) : 0;

              if (buyPrice && (state.holding === null || sellPrice)) {
                // Initialize startUnitsA benchmark
                let startUnitsA = Number(state.start_units_a);
                if (startUnitsA === 0) {
                  const pa = priceForBuy(qa, p.use_bid_ask);
                  if (pa) startUnitsA = Number(p.start_capital) / pa;
                }

                const fee = Number(p.fee_pct) / 100;
                let saleAmount: number;
                let commission: number;
                let newCapital: number;
                const units = Number(state.units);
                const cash = Number(state.cash_capital);
                if (state.holding === null) {
                  saleAmount = cash;
                  commission = 0;
                  newCapital = cash;
                } else {
                  saleAmount = units * sellPrice;
                  commission = saleAmount * fee;
                  newCapital = saleAmount - commission;
                }
                const newUnits = newCapital / buyPrice;

                await supabaseAdmin.from("trades").insert({
                  pair_id: p.id,
                  t: nowIso,
                  from_side: state.holding ?? target,
                  to_side: target,
                  sell_price: sellPrice,
                  buy_price: buyPrice,
                  units_sold: units,
                  gross_sale: saleAmount,
                  commission,
                  new_capital: newCapital,
                  new_units: newUnits,
                });

                stateUpdate.holding = target;
                stateUpdate.units = newUnits;
                stateUpdate.cash_capital = newCapital;
                stateUpdate.start_units_a = startUnitsA;
              }
            }
          }

          await supabaseAdmin.from("pair_state").update(stateUpdate).eq("pair_id", p.id);
          results.push({ pair: p.id, signal, sampleAdded });
        }

        return json(200, { ok: true, at: nowIso, results });
      },
    },
  },
});
