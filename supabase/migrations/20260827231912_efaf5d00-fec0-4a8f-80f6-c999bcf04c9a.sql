CREATE TABLE public.fund_samples (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  t TIMESTAMPTZ NOT NULL DEFAULT now(),
  price NUMERIC NOT NULL
);
CREATE INDEX fund_samples_symbol_t_idx ON public.fund_samples (symbol, t DESC);
GRANT SELECT ON public.fund_samples TO anon, authenticated;
GRANT ALL ON public.fund_samples TO service_role;
ALTER TABLE public.fund_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund_samples public read" ON public.fund_samples FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.multi_state (
  id TEXT PRIMARY KEY,
  funds TEXT[] NOT NULL,
  ref_symbol TEXT NOT NULL,
  ma_window INT NOT NULL DEFAULT 20,
  band_pct NUMERIC NOT NULL DEFAULT 0.5,
  fee_pct NUMERIC NOT NULL DEFAULT 0.24,
  sample_interval_sec INT NOT NULL DEFAULT 300,
  use_bid_ask BOOLEAN NOT NULL DEFAULT true,
  start_capital NUMERIC NOT NULL DEFAULT 100000000,
  holding TEXT,
  units NUMERIC NOT NULL DEFAULT 0,
  cash_capital NUMERIC NOT NULL DEFAULT 100000000,
  start_units_ref NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ
);
GRANT SELECT ON public.multi_state TO anon, authenticated;
GRANT ALL ON public.multi_state TO service_role;
ALTER TABLE public.multi_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "multi_state public read" ON public.multi_state FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.multi_trades (
  id BIGSERIAL PRIMARY KEY,
  state_id TEXT NOT NULL REFERENCES public.multi_state(id) ON DELETE CASCADE,
  t TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_fund TEXT,
  to_fund TEXT NOT NULL,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  buy_price NUMERIC NOT NULL,
  units_sold NUMERIC NOT NULL DEFAULT 0,
  gross_sale NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  new_capital NUMERIC NOT NULL,
  new_units NUMERIC NOT NULL,
  dev_pct NUMERIC
);
CREATE INDEX multi_trades_state_t_idx ON public.multi_trades (state_id, t DESC);
GRANT SELECT ON public.multi_trades TO anon, authenticated;
GRANT ALL ON public.multi_trades TO service_role;
ALTER TABLE public.multi_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "multi_trades public read" ON public.multi_trades FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.multi_state (id, funds, ref_symbol)
VALUES ('main', ARRAY['مثقال','کهربا','طلا','عیار','جواهر','گنج'], 'عیار');