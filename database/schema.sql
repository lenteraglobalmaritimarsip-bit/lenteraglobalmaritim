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
  phone VARCHAR(40),
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
  type VARCHAR(30) NOT NULL,
  contact_person VARCHAR(150), email VARCHAR(180), phone VARCHAR(40),
  address TEXT, credit_term_days INT DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL, imo_number VARCHAR(20) UNIQUE,
  call_sign VARCHAR(30), flag VARCHAR(80), vessel_type VARCHAR(50),
  grt NUMERIC(14,2), nrt NUMERIC(14,2), dwt NUMERIC(14,2),
  loa NUMERIC(10,2), beam NUMERIC(10,2), year_built INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL, country VARCHAR(80), unlocode VARCHAR(20),
  channel_depth_m NUMERIC(8,2), tide_restriction TEXT, operating_hours VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), port_id UUID REFERENCES ports(id),
  zone_code VARCHAR(30), zone_name VARCHAR(120), zone_type VARCHAR(30),
  max_draft_m NUMERIC(8,2), description TEXT
);

CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(40) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL, name VARCHAR(180) NOT NULL, unit VARCHAR(50),
  default_currency VARCHAR(3) NOT NULL, standard_cost_buy NUMERIC(18,2) DEFAULT 0,
  standard_cost_sell NUMERIC(18,2) DEFAULT 0, preferred_vendor VARCHAR(180)
);

CREATE TABLE IF NOT EXISTS fix_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), port_id UUID REFERENCES ports(id),
  service_code VARCHAR(40), service_name VARCHAR(180), calculation_basis VARCHAR(30),
  currency VARCHAR(3), rate NUMERIC(18,4), min_charge NUMERIC(18,2), description TEXT
);

-- One vessel call = one lifecycle job.
CREATE TABLE IF NOT EXISTS vessel_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(40) UNIQUE NOT NULL,
  vessel_id UUID REFERENCES vessels(id), customer_id UUID REFERENCES customers(id), port_id UUID REFERENCES ports(id),
  eta TIMESTAMPTZ, etd TIMESTAMPTZ, purpose_of_call VARCHAR(50), currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate_usd_idr NUMERIC(18,4), current_stage VARCHAR(40) NOT NULL DEFAULT 'INQUIRY',
  status VARCHAR(40) NOT NULL DEFAULT 'INQUIRY', created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  inquiry_no VARCHAR(50) UNIQUE NOT NULL, inquiry_date DATE NOT NULL, cargo_details TEXT,
  estimated_days NUMERIC(8,2), special_requirements TEXT, status VARCHAR(30), created_by UUID REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  quote_type VARCHAR(10) NOT NULL CHECK (quote_type IN ('EPDA','PDA')),
  quote_no VARCHAR(60) UNIQUE NOT NULL, quote_date DATE NOT NULL, currency VARCHAR(3),
  total_buy NUMERIC(18,2) DEFAULT 0, total_sell NUMERIC(18,2) DEFAULT 0,
  margin_amount NUMERIC(18,2) DEFAULT 0, margin_pct NUMERIC(8,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'DRAFT', created_by UUID REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  expense_item_id UUID REFERENCES expense_items(id), description VARCHAR(240), category VARCHAR(80), basis VARCHAR(80),
  quantity NUMERIC(14,3) DEFAULT 1, unit_buy NUMERIC(18,2) DEFAULT 0, unit_sell NUMERIC(18,2) DEFAULT 0,
  total_buy NUMERIC(18,2) DEFAULT 0, total_sell NUMERIC(18,2) DEFAULT 0, currency VARCHAR(3), remarks TEXT
);

CREATE TABLE IF NOT EXISTS manager_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', approved_by UUID REFERENCES app_users(id), approved_at TIMESTAMPTZ,
  notes TEXT, allowed_margin_tolerance_pct NUMERIC(8,2) DEFAULT 5
);

CREATE TABLE IF NOT EXISTS actual_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID REFERENCES vessel_calls(id) ON DELETE CASCADE,
  item_code VARCHAR(40), description VARCHAR(240), category VARCHAR(80), vendor_name VARCHAR(180),
  invoice_or_voucher_no VARCHAR(80), cost_date DATE, amount NUMERIC(18,2), currency VARCHAR(3),
  pda_estimated NUMERIC(18,2) DEFAULT 0, variance_amount NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(40) DEFAULT 'PENDING_VERIFICATION', attachment_name VARCHAR(240)
);

CREATE TABLE IF NOT EXISTS fda_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  fda_no VARCHAR(60) UNIQUE NOT NULL, fda_date DATE NOT NULL, total_estimated_buy NUMERIC(18,2) DEFAULT 0,
  total_estimated_sell NUMERIC(18,2) DEFAULT 0, total_actual_cost NUMERIC(18,2) DEFAULT 0,
  final_billed_to_principal NUMERIC(18,2) DEFAULT 0, variance_amount NUMERIC(18,2) DEFAULT 0,
  variance_pct NUMERIC(8,2) DEFAULT 0, fda_approved BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID REFERENCES vessel_calls(id), voucher_no VARCHAR(80),
  vendor_name VARCHAR(180), description TEXT, invoice_date DATE, due_date DATE, amount NUMERIC(18,2), currency VARCHAR(3),
  status VARCHAR(30) DEFAULT 'UNPAID', payment_ref VARCHAR(100), paid_date DATE
);

CREATE TABLE IF NOT EXISTS ar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID REFERENCES vessel_calls(id), reference_no VARCHAR(80),
  principal_name VARCHAR(180), description TEXT, requested_amount NUMERIC(18,2), received_amount NUMERIC(18,2) DEFAULT 0,
  currency VARCHAR(3), received_date DATE, bank_account VARCHAR(120), status VARCHAR(40) DEFAULT 'AWAITING_REMITTANCE'
);

CREATE TABLE IF NOT EXISTS principal_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  invoice_no VARCHAR(80) UNIQUE NOT NULL, invoice_date DATE, due_date DATE, total_amount_usd NUMERIC(18,2) DEFAULT 0,
  total_amount_idr NUMERIC(18,2) DEFAULT 0, advance_deducted_usd NUMERIC(18,2) DEFAULT 0,
  advance_deducted_idr NUMERIC(18,2) DEFAULT 0, balance_due_usd NUMERIC(18,2) DEFAULT 0,
  balance_due_idr NUMERIC(18,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'DRAFT', pdf_generated BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS job_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID UNIQUE REFERENCES vessel_calls(id) ON DELETE CASCADE,
  is_closed BOOLEAN DEFAULT FALSE, closed_at TIMESTAMPTZ, closed_by UUID REFERENCES app_users(id),
  final_gross_margin_usd NUMERIC(18,2) DEFAULT 0, final_gross_margin_idr NUMERIC(18,2) DEFAULT 0, post_voyage_remarks TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES app_users(id), action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80), entity_id VARCHAR(100), metadata JSONB, ip_address INET, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessel_calls_stage ON vessel_calls(current_stage);
CREATE INDEX IF NOT EXISTS idx_vessel_calls_status ON vessel_calls(status);
CREATE INDEX IF NOT EXISTS idx_actual_cost_job ON actual_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_ap_job ON ap_items(job_id);
CREATE INDEX IF NOT EXISTS idx_ar_job ON ar_items(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);
