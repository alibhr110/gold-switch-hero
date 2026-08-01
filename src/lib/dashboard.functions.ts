import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function serverClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const sb = serverClient();
  const [pairsRes, statesRes, quotesRes, tradesRes] = await Promise.all([
    sb.from("pairs").select("*").order("id"),
    sb.from("pair_state").select("*"),
    sb.from("symbol_quotes").select("*"),
    sb.from("trades").select("*").order("t", { ascending: false }).limit(200),
  ]);

  // Recent samples per pair (for MA / chart)
  const pairIds = (pairsRes.data ?? []).map((p) => p.id);
  const samplesByPair: Record<string, { t: string; a: number; b: number; ratio: number }[]> = {};
  await Promise.all(
    pairIds.map(async (id) => {
      const { data } = await sb
        .from("samples")
        .select("t, a, b, ratio")
        .eq("pair_id", id)
        .order("t", { ascending: false })
        .limit(600);
      samplesByPair[id] = (data ?? [])
        .map((r) => ({
          t: r.t as string,
          a: Number(r.a),
          b: Number(r.b),
          ratio: Number(r.ratio),
        }))
        .reverse();
    }),
  );

  return {
    pairs: pairsRes.data ?? [],
    states: statesRes.data ?? [],
    quotes: quotesRes.data ?? [],
    trades: tradesRes.data ?? [],
    samplesByPair,
    fetchedAt: new Date().toISOString(),
  };
});
