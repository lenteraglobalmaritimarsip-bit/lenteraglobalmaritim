-- MaritimPort / Supabase master-data repair
-- Jalankan seluruh file ini di Supabase SQL Editor.
-- Migration ini tidak menghapus data. Aman dijalankan ulang.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Prasyarat referensi port untuk master data.
CREATE TABLE IF NOT EXISTS ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(80),
  unlocode VARCHAR(20),
  channel_depth_m NUMERIC(8,2),
  tide_restriction TEXT,
  operating_hours VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buat tabel bila instalasi Supabase belum memilikinya.
CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID REFERENCES ports(id),
  port_name VARCHAR(150),
  code VARCHAR(40),
  category VARCHAR(50),
  name VARCHAR(180),
  unit VARCHAR(50),
  default_currency VARCHAR(3),
  standard_cost_buy NUMERIC(18,2) DEFAULT 0,
  standard_cost_sell NUMERIC(18,2) DEFAULT 0,
  rate_idr NUMERIC(18,4),
  rate_usd NUMERIC(18,4),
  preferred_vendor VARCHAR(180),
  calculation_type VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fix_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID REFERENCES ports(id),
  port_name VARCHAR(150),
  cost_category VARCHAR(80),
  service_code VARCHAR(40),
  service_name VARCHAR(180),
  grt NUMERIC(18,4),
  dwt NUMERIC(18,4),
  calculation_basis VARCHAR(30),
  tariff_type VARCHAR(20),
  currency VARCHAR(3),
  rate NUMERIC(18,4),
  rate_idr NUMERIC(18,4),
  rate_usd NUMERIC(18,4),
  min_charge NUMERIC(18,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lengkapi kolom pada tabel lama tanpa menghapus kolom/data existing.
ALTER TABLE ports
  ADD COLUMN IF NOT EXISTS country VARCHAR(80),
  ADD COLUMN IF NOT EXISTS unlocode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS channel_depth_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS tide_restriction TEXT,
  ADD COLUMN IF NOT EXISTS operating_hours VARCHAR(80),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS port_id UUID REFERENCES ports(id),
  ADD COLUMN IF NOT EXISTS port_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS standard_cost_buy NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_cost_sell NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_idr NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS rate_usd NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS preferred_vendor VARCHAR(180),
  ADD COLUMN IF NOT EXISTS calculation_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE fix_tariffs
  ADD COLUMN IF NOT EXISTS port_id UUID REFERENCES ports(id),
  ADD COLUMN IF NOT EXISTS port_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cost_category VARCHAR(80),
  ADD COLUMN IF NOT EXISTS service_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS service_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS grt NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS dwt NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS calculation_basis VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tariff_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS rate NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS rate_idr NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS rate_usd NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS min_charge NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill aman untuk data lama yang masih memakai satu currency/rate.
UPDATE expense_items
SET rate_idr = COALESCE(rate_idr, standard_cost_sell, standard_cost_buy)
WHERE UPPER(COALESCE(default_currency, '')) = 'IDR'
  AND rate_idr IS NULL;

UPDATE expense_items
SET rate_usd = COALESCE(rate_usd, standard_cost_sell, standard_cost_buy)
WHERE UPPER(COALESCE(default_currency, '')) = 'USD'
  AND rate_usd IS NULL;

UPDATE fix_tariffs
SET rate_idr = COALESCE(rate_idr, rate)
WHERE UPPER(COALESCE(currency, '')) = 'IDR'
  AND rate_idr IS NULL;

UPDATE fix_tariffs
SET rate_usd = COALESCE(rate_usd, rate)
WHERE UPPER(COALESCE(currency, '')) = 'USD'
  AND rate_usd IS NULL;

-- Nilai default hanya untuk baris lama yang kosong; tidak menimpa data valid.
UPDATE expense_items
SET calculation_type = 'FIXED'
WHERE calculation_type IS NULL OR BTRIM(calculation_type) = '';

-- Index non-unique sengaja dipakai agar migration tidak gagal karena data lama duplikat.
CREATE INDEX IF NOT EXISTS idx_expense_items_port_category_currency
  ON expense_items (port_id, category, default_currency);

CREATE INDEX IF NOT EXISTS idx_expense_items_name
  ON expense_items (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_fix_tariffs_port_category_currency
  ON fix_tariffs (port_id, cost_category, currency);

CREATE INDEX IF NOT EXISTS idx_fix_tariffs_service_name
  ON fix_tariffs (LOWER(TRIM(service_name)));

-- Paksa PostgREST membaca ulang struktur tabel agar error schema cache hilang.
NOTIFY pgrst, 'reload schema';

-- Verifikasi hasil migration.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ports', 'expense_items', 'fix_tariffs')
ORDER BY table_name, ordinal_position;

-- Baris status yang mudah dikenali di panel Results Supabase.
SELECT
  'SUCCESS' AS status,
  'Master data schema repair completed' AS message,
  (SELECT COUNT(*) FROM expense_items) AS expense_items_rows,
  (SELECT COUNT(*) FROM fix_tariffs) AS fix_tariffs_rows,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expense_items' AND column_name IN ('calculation_type', 'rate_idr', 'rate_usd')) AS expense_columns_ready,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fix_tariffs' AND column_name IN ('grt', 'dwt', 'rate_idr', 'rate_usd')) AS tariff_columns_ready;
