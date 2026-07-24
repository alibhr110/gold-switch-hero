
-- Pairs configuration
CREATE TABLE public.pairs (
  id text PRIMARY KEY,
  symbol_a text NOT NULL,
  symbol_b text NOT NULL,
  label text NOT NULL,
  ma_window integer NOT NULL DEFAULT 20,
  band_pct numeric NOT NULL DEFAULT 0.4,
  fee_pct numeric NOT NULL DEFAULT 0.24,
  sample_interval_sec integer NOT NULL DEFAULT 300,
  start_capital numeric NOT NULL DEFAULT 50000000,
  use_bid_ask boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pairs TO anon, authenticated;
GRANT ALL ON public.pairs TO service_role;
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pairs public read" ON public.pairs FOR SELECT USING (true);

-- Per-pair mutable state
CREATE TABLE public.pair_state (
  pair_id text PRIMARY KEY REFERENCES public.pairs(id) ON DELETE CASCADE,
  holding text CHECK (holding IN ('A','B')),
  units numeric NOT NULL DEFAULT 0,
  cash_capital numeric NOT NULL DEFAULT 0,
  start_units_a numeric NOT NULL DEFAULT 0,
  last_bid_a numeric,
  last_ask_a numeric,
  last_last_a numeric,
  last_bid_b numeric,
  last_ask_b numeric,
  last_last_b numeric,
  last_updated timestamptz
);
GRANT SELECT ON public.pair_state TO anon, authenticated;
GRANT ALL ON public.pair_state TO service_role;
ALTER TABLE public.pair_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pair_state public read" ON public.pair_state FOR SELECT USING (true);

-- Ratio samples
CREATE TABLE public.samples (
  id bigserial PRIMARY KEY,
  pair_id text NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  t timestamptz NOT NULL DEFAULT now(),
  a numeric NOT NULL,
  b numeric NOT NULL,
  ratio numeric NOT NULL
);
CREATE INDEX samples_pair_t_idx ON public.samples(pair_id, t DESC);
GRANT SELECT ON public.samples TO anon, authenticated;
GRANT ALL ON public.samples TO service_role;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "samples public read" ON public.samples FOR SELECT USING (true);

-- Executed trades
CREATE TABLE public.trades (
  id bigserial PRIMARY KEY,
  pair_id text NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  t timestamptz NOT NULL DEFAULT now(),
  from_side text NOT NULL,
  to_side text NOT NULL,
  sell_price numeric NOT NULL,
  buy_price numeric NOT NULL,
  units_sold numeric NOT NULL,
  gross_sale numeric NOT NULL,
  commission numeric NOT NULL,
  new_capital numeric NOT NULL,
  new_units numeric NOT NULL
);
CREATE INDEX trades_pair_t_idx ON public.trades(pair_id, t DESC);
GRANT SELECT ON public.trades TO anon, authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades public read" ON public.trades FOR SELECT USING (true);

-- Latest raw quote per symbol (for UI)
CREATE TABLE public.symbol_quotes (
  symbol text PRIMARY KEY,
  bid numeric,
  ask numeric,
  last numeric,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symbol_quotes TO anon, authenticated;
GRANT ALL ON public.symbol_quotes TO service_role;
ALTER TABLE public.symbol_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes public read" ON public.symbol_quotes FOR SELECT USING (true);
