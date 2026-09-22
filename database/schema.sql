-- LGM Keagenan / MaritimPort production database blueprint
-- Target: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN','SALES','MANAGER_OPS','FDA','FINANCE')),
  department VARCHAR(120),
  branch VARCHAR(60) NOT NULL DEFAULT 'Head Office',
  phone VARCHAR(40),
  position VARCHAR(120),
  avatar TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  company_name VARCHAR(180) NOT NULL,
  country VARCHAR(80),
  type VARCHAR(30) NOT NULL CHECK (type IN ('PRINCIPAL','CHARTERER','SHIPOWNER')),
  contact_person VARCHAR(150),
  email VARCHAR(180),
  phone VARCHAR(40),
  address TEXT,
  credit_term_days INT DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  imo_number VARCHAR(20) UNIQUE,
  call_sign VARCHAR(30),
  flag VARCHAR(80),
  vessel_type VARCHAR(50) CHECK (vessel_type IN ('BULK CARRIER','CONTAINER','OIL TANKER','GENERAL CARGO','TUG & BARGE','LNG CARRIER')),
  grt NUMERIC(14,2),
  nrt NUMERIC(14,2),
  dwt NUMERIC(14,2),
  loa NUMERIC(10,2),
  beam NUMERIC(10,2),
  year_built INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID REFERENCES ports(id),
  zone_code VARCHAR(30),
  zone_name VARCHAR(120),
  zone_type VARCHAR(30) CHECK (zone_type IN ('BERTH','ANCHORAGE','STS','INNER_ROAD','OUTER_ROAD')),
  max_draft_m NUMERIC(8,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (port_id, zone_code)
);

CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID REFERENCES ports(id),
  port_name VARCHAR(150),
  code VARCHAR(40) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('PORT_EXPENSES','CLEARANCE','GENERAL_EXPENSES','CREW_EXPENSES','OWNER_MATTER','AGENCY_FEE')),
  name VARCHAR(180) NOT NULL,
  unit VARCHAR(50),
  default_currency VARCHAR(3) NOT NULL CHECK (default_currency IN ('USD','IDR')),
  standard_cost_buy NUMERIC(18,2) DEFAULT 0,
  standard_cost_sell NUMERIC(18,2) DEFAULT 0,
  preferred_vendor VARCHAR(180),
  calculation_type VARCHAR(20) CHECK (calculation_type IN ('FIXED','VARIABLE','QTY_RATE','PERCENTAGE','RANGE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fix_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID REFERENCES ports(id),
  port_name VARCHAR(150),
  cost_category VARCHAR(80) CHECK (cost_category IS NULL OR cost_category IN ('PORT_EXPENSES','CLEARANCE','GENERAL_EXPENSES','CREW_EXPENSES','OWNER_MATTER','AGENCY_FEE')),
  service_code VARCHAR(40),
  service_name VARCHAR(180),
  calculation_basis VARCHAR(30) CHECK (calculation_basis IN ('PER_GRT','PER_DAY','LUMP_SUM','PER_HOUR','PER_MOVE')),
  tariff_type VARCHAR(20) CHECK (tariff_type IN ('FIXED','VARIABLE','RANGE')),
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  rate NUMERIC(18,4),
  min_charge NUMERIC(18,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fix_tariffs_service_port_category_currency
  ON fix_tariffs (
    LOWER(TRIM(service_name)),
    COALESCE(port_id::TEXT, LOWER(TRIM(port_name))),
    UPPER(COALESCE(cost_category, 'PORT_EXPENSES')),
    UPPER(currency)
  )
  WHERE service_name IS NOT NULL AND currency IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_items_name_port_category_currency
  ON expense_items (
    LOWER(TRIM(name)),
    COALESCE(port_id::TEXT, LOWER(TRIM(port_name))),
    UPPER(category),
    UPPER(default_currency)
  );

-- One vessel call = one lifecycle job.
CREATE TABLE IF NOT EXISTS vessel_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(40) UNIQUE NOT NULL,
  vessel_id UUID REFERENCES vessels(id),
  customer_id UUID REFERENCES customers(id),
  port_id UUID REFERENCES ports(id),
  eta TIMESTAMPTZ,
  etd TIMESTAMPTZ,
  purpose_of_call VARCHAR(50) CHECK (purpose_of_call IN ('CARGO_DISCHARGE','CARGO_LOADING','BUNKERING','CREW_CHANGE_ONLY','REPAIR_MAINTENANCE')),
  currency VARCHAR(3) DEFAULT 'USD' CHECK (currency IN ('USD','IDR')),
  exchange_rate_usd_idr NUMERIC(18,4),
  current_stage VARCHAR(40) NOT NULL DEFAULT 'INQUIRY',
  status VARCHAR(40) NOT NULL DEFAULT 'INQUIRY',
  job_payload JSONB,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  inquiry_no VARCHAR(50) UNIQUE NOT NULL,
  inquiry_date DATE NOT NULL,
  cargo_details TEXT,
  quantity NUMERIC(14,3) DEFAULT 0,
  quantity_unit VARCHAR(20) CHECK (quantity_unit IN ('MATRIX_TON','TON')),
  estimated_days NUMERIC(8,2),
  special_requirements TEXT,
  status VARCHAR(30) DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','EVALUATED','CONVERTED')),
  created_by UUID REFERENCES app_users(id),
  created_by_name VARCHAR(150),
  created_by_branch VARCHAR(60),
  created_by_branch_code VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  quote_type VARCHAR(10) NOT NULL CHECK (quote_type IN ('EPDA','PDA')),
  quote_no VARCHAR(60) UNIQUE NOT NULL,
  quote_date DATE NOT NULL,
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  total_buy NUMERIC(18,2) DEFAULT 0,
  total_sell NUMERIC(18,2) DEFAULT 0,
  margin_amount NUMERIC(18,2) DEFAULT 0,
  margin_pct NUMERIC(8,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'DRAFT',
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  expense_item_id UUID REFERENCES expense_items(id),
  description VARCHAR(240),
  category VARCHAR(80),
  basis VARCHAR(80),
  type VARCHAR(20) DEFAULT 'VARIABLE' CHECK (type IN ('FIXED','VARIABLE','RANGE')),
  quantity NUMERIC(14,3) DEFAULT 1,
  unit_buy NUMERIC(18,2) DEFAULT 0,
  unit_sell NUMERIC(18,2) DEFAULT 0,
  total_buy NUMERIC(18,2) DEFAULT 0,
  total_sell NUMERIC(18,2) DEFAULT 0,
  currency VARCHAR(3),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_change_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  sign_on_count INT DEFAULT 0,
  sign_off_count INT DEFAULT 0,
  logistics_cost NUMERIC(18,2) DEFAULT 0,
  immigration_visa_cost NUMERIC(18,2) DEFAULT 0,
  transport_cost NUMERIC(18,2) DEFAULT 0,
  total_cost_usd NUMERIC(18,2) DEFAULT 0,
  total_cost_idr NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_TRANSIT','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_change_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_change_id UUID REFERENCES crew_change_records(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  passport_number VARCHAR(80),
  seaman_book VARCHAR(80),
  rank VARCHAR(80),
  nationality VARCHAR(80),
  member_type VARCHAR(16) CHECK (member_type IN ('SIGN_ON','SIGN_OFF')),
  flight_details TEXT,
  hotel_booked BOOLEAN DEFAULT FALSE,
  transit_cost_usd NUMERIC(18,2) DEFAULT 0,
  immigration_status VARCHAR(20) DEFAULT 'PENDING' CHECK (immigration_status IN ('PENDING','CLEARED','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manager_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  allowed_margin_tolerance_pct NUMERIC(8,2) DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actual_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  item_code VARCHAR(40),
  description VARCHAR(240),
  category VARCHAR(80),
  type VARCHAR(20) DEFAULT 'VARIABLE' CHECK (type IN ('FIXED','VARIABLE','RANGE')),
  vendor_name VARCHAR(180),
  invoice_or_voucher_no VARCHAR(80),
  cost_date DATE,
  amount NUMERIC(18,2),
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  pda_estimated NUMERIC(18,2) DEFAULT 0,
  variance_amount NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(40) DEFAULT 'PENDING_VERIFICATION' CHECK (status IN ('PENDING_VERIFICATION','VERIFIED','APPROVED_BY_FDA')),
  attachment_name VARCHAR(240),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fda_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  fda_no VARCHAR(60) UNIQUE NOT NULL,
  fda_date DATE NOT NULL,
  total_estimated_buy NUMERIC(18,2) DEFAULT 0,
  total_estimated_sell NUMERIC(18,2) DEFAULT 0,
  total_actual_cost NUMERIC(18,2) DEFAULT 0,
  final_billed_to_principal NUMERIC(18,2) DEFAULT 0,
  variance_amount NUMERIC(18,2) DEFAULT 0,
  variance_pct NUMERIC(8,2) DEFAULT 0,
  fda_approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  pdf_file_name VARCHAR(240),
  pdf_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id),
  voucher_no VARCHAR(80),
  vendor_name VARCHAR(180),
  description TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC(18,2),
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  status VARCHAR(30) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIALLY_PAID','PAID')),
  payment_ref VARCHAR(100),
  paid_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id),
  reference_no VARCHAR(80),
  principal_name VARCHAR(180),
  description TEXT,
  requested_amount NUMERIC(18,2),
  received_amount NUMERIC(18,2) DEFAULT 0,
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  received_date DATE,
  bank_account VARCHAR(120),
  status VARCHAR(40) DEFAULT 'AWAITING_REMITTANCE' CHECK (status IN ('AWAITING_REMITTANCE','RECEIVED','OVERDUE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS principal_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  received_date DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) CHECK (currency IN ('USD','IDR')),
  payment_type VARCHAR(30) CHECK (payment_type IN ('ADVANCE_PAYMENT','INVOICE')),
  bank_remark TEXT,
  attachment_name VARCHAR(240),
  attachment_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS principal_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  invoice_no VARCHAR(80) UNIQUE NOT NULL,
  invoice_date DATE,
  due_date DATE,
  total_amount_usd NUMERIC(18,2) DEFAULT 0,
  total_amount_idr NUMERIC(18,2) DEFAULT 0,
  advance_deducted_usd NUMERIC(18,2) DEFAULT 0,
  advance_deducted_idr NUMERIC(18,2) DEFAULT 0,
  balance_due_usd NUMERIC(18,2) DEFAULT 0,
  balance_due_idr NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','SETTLED')),
  pdf_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  is_closed BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES app_users(id),
  final_gross_margin_usd NUMERIC(18,2) DEFAULT 0,
  final_gross_margin_idr NUMERIC(18,2) DEFAULT 0,
  post_voyage_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statement_of_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  event_time TIMESTAMPTZ NOT NULL,
  event VARCHAR(240) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES app_users(id),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(100),
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessel_calls_stage ON vessel_calls(current_stage);
CREATE INDEX IF NOT EXISTS idx_vessel_calls_status ON vessel_calls(status);
CREATE INDEX IF NOT EXISTS idx_actual_cost_job ON actual_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_ap_job ON ap_items(job_id);
CREATE INDEX IF NOT EXISTS idx_ar_job ON ar_items(job_id);
CREATE INDEX IF NOT EXISTS idx_principal_receipts_job ON principal_receipts(job_id);
CREATE INDEX IF NOT EXISTS idx_statement_of_facts_job ON statement_of_facts(job_id, event_time);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);

-- Application field alignment for the current React data model.
-- These statements are idempotent and can be run in an existing Supabase project.
ALTER TABLE vessel_calls
  ADD COLUMN IF NOT EXISTS vessel_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS port_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS ata TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atb TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atd TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pilot_on_board_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pilot_off_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS berth_zone_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cargo_quantity_metric_tons NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS cargo_commodity VARCHAR(180),
  ADD COLUMN IF NOT EXISTS harbor_master_clearance_no VARCHAR(80),
  ADD COLUMN IF NOT EXISTS job_payload JSONB;

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS eta_remarks TEXT,
  ADD COLUMN IF NOT EXISTS etd_remarks TEXT,
  ADD COLUMN IF NOT EXISTS created_by_branch VARCHAR(60),
  ADD COLUMN IF NOT EXISTS created_by_branch_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_users(id);

ALTER TABLE fda_records
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) CHECK (currency IN ('USD','IDR'));

ALTER TABLE principal_invoices
  ADD COLUMN IF NOT EXISTS pdf_data_url TEXT;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS branch_code VARCHAR(20);

-- Keep category constraints aligned when this schema is re-run on an existing database.
ALTER TABLE expense_items DROP CONSTRAINT IF EXISTS expense_items_category_check;
ALTER TABLE expense_items
  ADD CONSTRAINT expense_items_category_check
  CHECK (category IN ('PORT_EXPENSES','CLEARANCE','GENERAL_EXPENSES','CREW_EXPENSES','OWNER_MATTER','AGENCY_FEE'));

ALTER TABLE fix_tariffs
  ADD COLUMN IF NOT EXISTS cost_category VARCHAR(80),
  ADD COLUMN IF NOT EXISTS port_name VARCHAR(150);

ALTER TABLE fix_tariffs DROP CONSTRAINT IF EXISTS fix_tariffs_cost_category_check;
ALTER TABLE fix_tariffs
  ADD CONSTRAINT fix_tariffs_cost_category_check
  CHECK (cost_category IS NULL OR cost_category IN ('PORT_EXPENSES','CLEARANCE','GENERAL_EXPENSES','CREW_EXPENSES','OWNER_MATTER','AGENCY_FEE'));

CREATE INDEX IF NOT EXISTS idx_inquiries_created_by_branch ON inquiries(created_by_branch);
CREATE INDEX IF NOT EXISTS idx_vessel_calls_created_by ON vessel_calls(created_by);
