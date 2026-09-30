-- MaritimPort / Lentera Global Maritim
-- PostgreSQL schema for Admin, Sales, Manager Ops, FDA, and Finance workflows.
-- Runtime note: the current demo still persists through browser localStorage.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE');
CREATE TYPE record_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE currency_code AS ENUM ('IDR', 'USD');
CREATE TYPE tariff_basis AS ENUM ('PER_GRT', 'PER_DAY', 'LUMP_SUM', 'PER_HOUR', 'PER_MOVE');
CREATE TYPE tariff_type AS ENUM ('FIXED', 'VARIABLE', 'RANGE');
CREATE TYPE expense_calculation_type AS ENUM ('FIXED', 'VARIABLE', 'QTY_RATE', 'PERCENTAGE', 'RANGE');
CREATE TYPE job_stage AS ENUM ('INQUIRY', 'QUOTATION', 'MANAGER_APPROVAL', 'OPERATIONAL', 'ACTUAL_COST', 'FDA', 'AP_AR', 'PRINCIPAL_INVOICE', 'CLOSED');
CREATE TYPE job_status AS ENUM ('INQUIRY', 'QUOTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED');
CREATE TYPE inquiry_status AS ENUM ('RECEIVED', 'EVALUATED', 'CONVERTED');
CREATE TYPE quotation_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');
CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE fda_approval_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE cost_status AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'APPROVED_BY_FDA');
CREATE TYPE ap_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');
CREATE TYPE ar_status AS ENUM ('AWAITING_REMITTANCE', 'RECEIVED', 'OVERDUE');
CREATE TYPE receipt_type AS ENUM ('ADVANCE_PAYMENT', 'INVOICE');
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'SETTLED');
CREATE TYPE vessel_call_purpose AS ENUM ('CARGO_DISCHARGE', 'CARGO_LOADING', 'BUNKERING', 'CREW_CHANGE_ONLY', 'REPAIR_MAINTENANCE');
CREATE TYPE zone_type AS ENUM ('BERTH', 'ANCHORAGE', 'STS', 'INNER_ROAD', 'OUTER_ROAD');
CREATE TYPE crew_type AS ENUM ('SIGN_ON', 'SIGN_OFF');
CREATE TYPE immigration_status AS ENUM ('PENDING', 'CLEARED', 'REJECTED');

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(150) NOT NULL UNIQUE,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  username varchar(100) UNIQUE,
  password_hash text,
  role user_role NOT NULL,
  department varchar(120) NOT NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  branch_name varchar(150),
  position varchar(120),
  phone varchar(50),
  avatar text,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  company_name varchar(200) NOT NULL,
  country varchar(100) NOT NULL,
  customer_type varchar(30) NOT NULL CHECK (customer_type IN ('PRINCIPAL', 'CHARTERER', 'SHIPOWNER')),
  contact_person varchar(150) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(50) NOT NULL,
  address text NOT NULL,
  credit_term_days integer NOT NULL DEFAULT 30 CHECK (credit_term_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vessels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  imo_number varchar(30) NOT NULL UNIQUE,
  call_sign varchar(50) NOT NULL,
  flag varchar(100) NOT NULL,
  vessel_type varchar(40) NOT NULL CHECK (vessel_type IN ('BULK CARRIER', 'CONTAINER', 'OIL TANKER', 'GENERAL CARGO', 'TUG & BARGE', 'LNG CARRIER')),
  grt numeric(18,4) NOT NULL DEFAULT 0 CHECK (grt >= 0),
  nrt numeric(18,4) NOT NULL DEFAULT 0 CHECK (nrt >= 0),
  dwt numeric(18,4) NOT NULL DEFAULT 0 CHECK (dwt >= 0),
  loa numeric(12,4) NOT NULL DEFAULT 0 CHECK (loa >= 0),
  beam numeric(12,4) NOT NULL DEFAULT 0 CHECK (beam >= 0),
  year_built integer CHECK (year_built BETWEEN 1800 AND 2200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(150) NOT NULL UNIQUE,
  country varchar(100) NOT NULL,
  unlocode varchar(20) NOT NULL UNIQUE,
  channel_depth_meters numeric(10,3) NOT NULL DEFAULT 0 CHECK (channel_depth_meters >= 0),
  tide_restriction text,
  operating_hours varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id uuid NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
  zone_code varchar(40) NOT NULL,
  zone_name varchar(150) NOT NULL,
  zone_type zone_type NOT NULL,
  max_draft_meters numeric(10,3) NOT NULL DEFAULT 0 CHECK (max_draft_meters >= 0),
  description text,
  UNIQUE (port_id, zone_code)
);

CREATE TABLE fix_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id uuid NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
  service_code varchar(50) NOT NULL,
  service_name varchar(200) NOT NULL,
  cost_category varchar(80),
  grt numeric(18,4),
  grt_min numeric(18,4),
  grt_max numeric(18,4),
  dwt numeric(18,4),
  calculation_basis tariff_basis NOT NULL,
  tariff_type tariff_type,
  currency currency_code NOT NULL,
  rate numeric(30,12) NOT NULL DEFAULT 0,
  rate_idr numeric(30,12),
  rate_usd numeric(30,12),
  min_charge numeric(30,12) NOT NULL DEFAULT 0,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (grt_min IS NULL OR grt_min >= 0),
  CHECK (grt_max IS NULL OR grt_max >= 0),
  CHECK (rate >= 0),
  CHECK (min_charge >= 0)
);

CREATE TABLE expenses_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id uuid REFERENCES ports(id) ON DELETE SET NULL,
  code varchar(50) NOT NULL UNIQUE,
  category varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  unit varchar(50),
  default_currency currency_code NOT NULL,
  standard_cost_buy numeric(30,12) NOT NULL DEFAULT 0,
  standard_cost_sell numeric(30,12) NOT NULL DEFAULT 0,
  rate_idr numeric(30,12),
  rate_usd numeric(30,12),
  preferred_vendor varchar(200),
  calculation_type expense_calculation_type,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (standard_cost_buy >= 0),
  CHECK (standard_cost_sell >= 0)
);

CREATE TABLE vessel_calls (
  job_id varchar(50) PRIMARY KEY,
  vessel_id uuid NOT NULL REFERENCES vessels(id),
  port_id uuid NOT NULL REFERENCES ports(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  currency currency_code NOT NULL,
  exchange_rate_usd_to_idr numeric(30,12) NOT NULL DEFAULT 15800 CHECK (exchange_rate_usd_to_idr > 0),
  eta timestamptz,
  etd timestamptz,
  purpose_of_call vessel_call_purpose NOT NULL,
  current_stage job_stage NOT NULL DEFAULT 'INQUIRY',
  status job_status NOT NULL DEFAULT 'INQUIRY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inquiries (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  inquiry_no varchar(60) NOT NULL UNIQUE,
  inquiry_date date NOT NULL,
  eta_remarks text,
  etd_remarks text,
  quantity numeric(18,4),
  quantity_unit varchar(30),
  cargo_details text NOT NULL,
  estimated_days numeric(12,4) NOT NULL DEFAULT 0 CHECK (estimated_days >= 0),
  special_requirements text NOT NULL DEFAULT '',
  CHECK (quantity_unit IS NULL OR quantity_unit IN ('MATRIX_TON', 'TON')),
  status inquiry_status NOT NULL DEFAULT 'RECEIVED',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_name varchar(150),
  created_by_branch varchar(150),
  created_by_branch_code varchar(30)
);

CREATE TABLE quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  quote_type varchar(10) NOT NULL CHECK (quote_type IN ('EPDA', 'PDA')),
  quote_no varchar(80) NOT NULL,
  quote_date date NOT NULL,
  currency currency_code NOT NULL,
  total_buy_rate numeric(30,12) NOT NULL DEFAULT 0,
  total_sell_rate numeric(30,12) NOT NULL DEFAULT 0,
  margin_amount numeric(30,12) NOT NULL DEFAULT 0,
  margin_percentage numeric(18,6) NOT NULL DEFAULT 0,
  status quotation_status NOT NULL DEFAULT 'DRAFT',
  UNIQUE (job_id, quote_type),
  UNIQUE (quote_no)
);

CREATE TABLE quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  expense_item_id uuid REFERENCES expenses_items(id) ON DELETE SET NULL,
  fix_tariff_id uuid REFERENCES fix_tariffs(id) ON DELETE SET NULL,
  entry_order integer NOT NULL,
  name varchar(200) NOT NULL,
  category varchar(80) NOT NULL CHECK (category IN ('PORT_EXPENSES', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES', 'OWNER_MATTER', 'AGENCY_FEE', 'TAX_CONTINGENCY', 'PORT_DUES', 'PILOTAGE_TOWAGE', 'BERTHING', 'CREW_CHANGE', 'IMMIGRATION_CUSTOMS', 'LOGISTICS_SUPPLIES', 'SUNDRY')),
  basis text NOT NULL DEFAULT '',
  quantity numeric(18,6) NOT NULL DEFAULT 1,
  unit_buy_rate numeric(30,12) NOT NULL DEFAULT 0,
  unit_sell_rate numeric(30,12) NOT NULL DEFAULT 0,
  total_buy_rate numeric(30,12) NOT NULL DEFAULT 0,
  total_sell_rate numeric(30,12) NOT NULL DEFAULT 0,
  currency currency_code NOT NULL,
  tariff_type tariff_type,
  calculation_basis tariff_basis,
  tariff_rate numeric(30,12),
  remarks text,
  UNIQUE (quotation_id, entry_order)
);

CREATE TABLE crew_change_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL UNIQUE REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  sign_on_count integer NOT NULL DEFAULT 0 CHECK (sign_on_count >= 0),
  sign_off_count integer NOT NULL DEFAULT 0 CHECK (sign_off_count >= 0),
  logistics_cost numeric(30,12) NOT NULL DEFAULT 0,
  immigration_visa_cost numeric(30,12) NOT NULL DEFAULT 0,
  transport_cost numeric(30,12) NOT NULL DEFAULT 0,
  total_cost_usd numeric(30,12) NOT NULL DEFAULT 0,
  total_cost_idr numeric(30,12) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_TRANSIT', 'COMPLETED'))
);

CREATE TABLE crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_change_plan_id uuid NOT NULL REFERENCES crew_change_plans(id) ON DELETE CASCADE,
  name varchar(150) NOT NULL,
  passport_number varchar(80) NOT NULL,
  seaman_book varchar(80) NOT NULL,
  rank varchar(100) NOT NULL,
  nationality varchar(100) NOT NULL,
  crew_type crew_type NOT NULL,
  flight_details text,
  hotel_booked boolean NOT NULL DEFAULT false,
  transit_cost_usd numeric(30,12) NOT NULL DEFAULT 0,
  immigration_status immigration_status NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE manager_approvals (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  status approval_status NOT NULL DEFAULT 'PENDING',
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name varchar(150),
  approved_at timestamptz,
  notes text,
  allowed_margin_tolerance_pct numeric(18,6) NOT NULL DEFAULT 0
);

CREATE TABLE operational_data (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  ata timestamptz,
  atb timestamptz,
  atd timestamptz,
  pilot_on_board_time timestamptz,
  pilot_off_time timestamptz,
  berth_zone_name varchar(150),
  cargo_quantity_metric_tons numeric(18,4),
  cargo_commodity varchar(150),
  harbor_master_clearance_no varchar(100)
);

CREATE TABLE statements_of_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  event_time timestamptz NOT NULL,
  event varchar(200) NOT NULL,
  remarks text
);

CREATE TABLE actual_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  item_code varchar(60) NOT NULL,
  description varchar(200) NOT NULL,
  category varchar(80) NOT NULL,
  vendor_name varchar(200) NOT NULL,
  invoice_or_voucher_no varchar(100) NOT NULL,
  cost_date date NOT NULL,
  quantity numeric(18,6),
  amount numeric(30,12) NOT NULL DEFAULT 0,
  currency currency_code NOT NULL,
  tariff_type tariff_type,
  calculation_basis tariff_basis,
  tariff_rate numeric(30,12),
  pda_amount_estimated numeric(30,12) NOT NULL DEFAULT 0,
  variance_amount numeric(30,12) NOT NULL DEFAULT 0,
  status cost_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  attachment_name varchar(255),
  attachment_data_url text,
  remarks text
);

CREATE TABLE fda_records (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  fda_no varchar(80) NOT NULL UNIQUE,
  fda_date date NOT NULL,
  currency currency_code,
  total_estimated_buy numeric(30,12) NOT NULL DEFAULT 0,
  total_estimated_sell numeric(30,12) NOT NULL DEFAULT 0,
  total_actual_cost numeric(30,12) NOT NULL DEFAULT 0,
  final_billed_to_principal numeric(30,12) NOT NULL DEFAULT 0,
  variance_amount numeric(30,12) NOT NULL DEFAULT 0,
  variance_percentage numeric(18,6) NOT NULL DEFAULT 0,
  fda_approved boolean NOT NULL DEFAULT false,
  approval_status fda_approval_status NOT NULL DEFAULT 'DRAFT',
  submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_name varchar(150),
  submitted_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name varchar(150),
  approved_at timestamptz,
  notes text,
  pdf_file_name varchar(255),
  pdf_data_url text
);

CREATE TABLE ap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  voucher_no varchar(100) NOT NULL,
  vendor_name varchar(200) NOT NULL,
  description text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  amount numeric(30,12) NOT NULL DEFAULT 0,
  currency currency_code NOT NULL,
  status ap_status NOT NULL DEFAULT 'UNPAID',
  payment_ref varchar(100),
  paid_date date
);

CREATE TABLE ar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  reference_no varchar(100) NOT NULL,
  principal_name varchar(200) NOT NULL,
  description text NOT NULL,
  requested_amount numeric(30,12) NOT NULL DEFAULT 0,
  received_amount numeric(30,12) NOT NULL DEFAULT 0,
  currency currency_code NOT NULL,
  received_date date,
  bank_account varchar(150),
  status ar_status NOT NULL DEFAULT 'AWAITING_REMITTANCE'
);

CREATE TABLE principal_invoices (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  invoice_no varchar(100) NOT NULL UNIQUE,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  total_amount_usd numeric(30,12) NOT NULL DEFAULT 0,
  total_amount_idr numeric(30,12) NOT NULL DEFAULT 0,
  advance_deducted_usd numeric(30,12) NOT NULL DEFAULT 0,
  advance_deducted_idr numeric(30,12) NOT NULL DEFAULT 0,
  balance_due_usd numeric(30,12) NOT NULL DEFAULT 0,
  balance_due_idr numeric(30,12) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  pdf_generated boolean NOT NULL DEFAULT false
);

CREATE TABLE principal_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(50) NOT NULL REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  received_date date NOT NULL,
  amount numeric(30,12) NOT NULL CHECK (amount > 0),
  currency currency_code NOT NULL,
  payment_type receipt_type NOT NULL,
  bank_remark text NOT NULL,
  attachment_name varchar(255),
  attachment_data_url text
);

CREATE TABLE closing_records (
  job_id varchar(50) PRIMARY KEY REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_by_name varchar(150),
  final_gross_margin_usd numeric(30,12) NOT NULL DEFAULT 0,
  final_gross_margin_idr numeric(30,12) NOT NULL DEFAULT 0,
  post_voyage_remarks text
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name varchar(150) NOT NULL,
  actor_role user_role NOT NULL,
  action varchar(100) NOT NULL,
  entity varchar(100) NOT NULL,
  entity_id varchar(100),
  description text NOT NULL
);

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_zones_port ON zones(port_id);
CREATE INDEX idx_fix_tariffs_port_service ON fix_tariffs(port_id, service_name);
CREATE INDEX idx_fix_tariffs_port_grt ON fix_tariffs(port_id, grt_min, grt_max);
CREATE INDEX idx_expenses_items_port_category ON expenses_items(port_id, category);
CREATE INDEX idx_vessel_calls_stage_status ON vessel_calls(current_stage, status);
CREATE INDEX idx_vessel_calls_port ON vessel_calls(port_id);
CREATE INDEX idx_vessel_calls_customer ON vessel_calls(customer_id);
CREATE INDEX idx_quotation_items_order ON quotation_items(quotation_id, entry_order);
CREATE INDEX idx_actual_costs_job_status ON actual_costs(job_id, status);
CREATE INDEX idx_ap_items_job_status ON ap_items(job_id, status);
CREATE INDEX idx_ar_items_job_status ON ar_items(job_id, status);
CREATE INDEX idx_receipts_job_date ON principal_receipts(job_id, received_date);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vessels_updated_at BEFORE UPDATE ON vessels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ports_updated_at BEFORE UPDATE ON ports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fix_tariffs_updated_at BEFORE UPDATE ON fix_tariffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_expenses_items_updated_at BEFORE UPDATE ON expenses_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vessel_calls_updated_at BEFORE UPDATE ON vessel_calls FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
