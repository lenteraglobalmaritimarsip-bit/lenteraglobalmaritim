-- MaritimPort / Lentera Global Maritim
-- MySQL 8.0.16+ schema for Admin, Sales, Manager Ops, FDA, and Finance workflows.
-- Runtime note: the current demo still persists through browser localStorage.
-- IDs are supplied by the application (for example USR-001, EXP-001, and ACT-...).

SET NAMES utf8mb4;

CREATE TABLE branches (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  address TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) UNIQUE,
  password_hash TEXT,
  role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE') NOT NULL,
  department VARCHAR(120) NOT NULL,
  branch_code VARCHAR(30),
  branch_name VARCHAR(150),
  position VARCHAR(120),
  phone VARCHAR(50),
  avatar TEXT,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_users_branch_code FOREIGN KEY (branch_code) REFERENCES branches(code) ON DELETE SET NULL,
  INDEX idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  country VARCHAR(100) NOT NULL,
  customer_type ENUM('PRINCIPAL', 'CHARTERER', 'SHIPOWNER') NOT NULL,
  contact_person VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address TEXT NOT NULL,
  credit_term_days INT NOT NULL DEFAULT 30 CHECK (credit_term_days >= 0),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vessels (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  imo_number VARCHAR(30) NOT NULL UNIQUE,
  call_sign VARCHAR(50) NOT NULL,
  flag VARCHAR(100) NOT NULL,
  vessel_type ENUM('BULK CARRIER', 'CONTAINER', 'OIL TANKER', 'GENERAL CARGO', 'TUG & BARGE', 'LNG CARRIER') NOT NULL,
  grt DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (grt >= 0),
  nrt DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (nrt >= 0),
  dwt DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (dwt >= 0),
  loa DECIMAL(12,4) NOT NULL DEFAULT 0 CHECK (loa >= 0),
  beam DECIMAL(12,4) NOT NULL DEFAULT 0 CHECK (beam >= 0),
  year_built INT CHECK (year_built BETWEEN 1800 AND 2200),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ports (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  country VARCHAR(100) NOT NULL,
  unlocode VARCHAR(20) NOT NULL UNIQUE,
  channel_depth_meters DECIMAL(10,3) NOT NULL DEFAULT 0 CHECK (channel_depth_meters >= 0),
  tide_restriction TEXT,
  operating_hours VARCHAR(100),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE zones (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  port_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  zone_code VARCHAR(40) NOT NULL,
  zone_name VARCHAR(150) NOT NULL,
  zone_type ENUM('BERTH', 'ANCHORAGE', 'STS', 'INNER_ROAD', 'OUTER_ROAD') NOT NULL,
  max_draft_meters DECIMAL(10,3) NOT NULL DEFAULT 0 CHECK (max_draft_meters >= 0),
  description TEXT,
  UNIQUE KEY uq_zones_port_code (port_id, zone_code),
  INDEX idx_zones_port (port_id),
  CONSTRAINT fk_zones_port FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fix_tariffs (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  port_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  service_code VARCHAR(50) NOT NULL,
  service_name VARCHAR(200) NOT NULL,
  cost_category VARCHAR(80),
  grt DECIMAL(18,4),
  grt_min DECIMAL(18,4),
  grt_max DECIMAL(18,4),
  dwt DECIMAL(18,4),
  calculation_basis ENUM('PER_GRT', 'PER_DAY', 'LUMP_SUM', 'PER_HOUR', 'PER_MOVE') NOT NULL,
  tariff_type ENUM('FIXED', 'VARIABLE', 'RANGE'),
  currency ENUM('IDR', 'USD') NOT NULL,
  rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  rate_idr DECIMAL(30,12),
  rate_usd DECIMAL(30,12),
  min_charge DECIMAL(30,12) NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CHECK (grt_min IS NULL OR grt_min >= 0),
  CHECK (grt_max IS NULL OR grt_max >= 0),
  CHECK (rate >= 0),
  CHECK (min_charge >= 0),
  INDEX idx_fix_tariffs_port_service (port_id, service_name),
  INDEX idx_fix_tariffs_port_grt (port_id, grt_min, grt_max),
  CONSTRAINT fk_fix_tariffs_port FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses_items (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  port_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  code VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50),
  default_currency ENUM('IDR', 'USD') NOT NULL,
  standard_cost_buy DECIMAL(30,12) NOT NULL DEFAULT 0,
  standard_cost_sell DECIMAL(30,12) NOT NULL DEFAULT 0,
  rate_idr DECIMAL(30,12),
  rate_usd DECIMAL(30,12),
  preferred_vendor VARCHAR(200),
  calculation_type ENUM('FIXED', 'VARIABLE', 'QTY_RATE', 'PERCENTAGE', 'RANGE'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CHECK (standard_cost_buy >= 0),
  CHECK (standard_cost_sell >= 0),
  INDEX idx_expenses_items_port_category (port_id, category),
  CONSTRAINT fk_expenses_items_port FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vendor_partners (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  vendor_name VARCHAR(200) NOT NULL,
  bank_name VARCHAR(150),
  paid_name VARCHAR(200),
  account_number VARCHAR(80),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_vendor_partners_name (vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bank_accounts (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bank_name VARCHAR(200) NOT NULL,
  branch VARCHAR(150),
  account_name VARCHAR(200) NOT NULL,
  account_number VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_bank_accounts_name (bank_name, account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_vouchers (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  request_date DATE NOT NULL,
  job_info ENUM('OPERASIONAL', 'JOB_VESSEL') NOT NULL,
  request_by VARCHAR(200) NOT NULL,
  vendor_partner_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  vendor_name VARCHAR(200) NOT NULL,
  paid_to VARCHAR(200),
  bank_name VARCHAR(150),
  account_number VARCHAR(80),
  total_paid_amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  status ENUM('PENDING_MANAGER', 'APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'PENDING_MANAGER',
  manager_note TEXT,
  reviewed_by VARCHAR(200),
  reviewed_at DATETIME(3) NULL,
  paid_by VARCHAR(200),
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_payment_vouchers_date (request_date),
  CONSTRAINT fk_payment_vouchers_vendor FOREIGN KEY (vendor_partner_id) REFERENCES vendor_partners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_voucher_items (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  voucher_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  line_no INT NOT NULL,
  job_number VARCHAR(100) NOT NULL,
  customer_name VARCHAR(200) NOT NULL,
  item_service VARCHAR(250) NOT NULL,
  amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  vat_applied TINYINT(1) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  total DECIMAL(30,2) NOT NULL DEFAULT 0,
  pph23_applied TINYINT(1) NOT NULL DEFAULT 0,
  pph23_amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  pph21_applied TINYINT(1) NOT NULL DEFAULT 0,
  pph21_amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(30,2) NOT NULL DEFAULT 0,
  INDEX idx_payment_voucher_items_voucher (voucher_id, line_no),
  INDEX idx_payment_voucher_items_job (job_number),
  CONSTRAINT fk_payment_voucher_items_voucher FOREIGN KEY (voucher_id) REFERENCES payment_vouchers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE vessel_calls (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  vessel_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  port_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency ENUM('IDR', 'USD') NOT NULL,
  exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 15800 CHECK (exchange_rate_usd_to_idr > 0),
  eta DATETIME(3),
  etd DATETIME(3),
  purpose_of_call ENUM('CARGO_DISCHARGE', 'CARGO_LOADING', 'BUNKERING', 'CREW_CHANGE_ONLY', 'REPAIR_MAINTENANCE') NOT NULL,
  current_stage ENUM('INQUIRY', 'QUOTATION', 'MANAGER_APPROVAL', 'OPERATIONAL', 'ACTUAL_COST', 'FDA', 'AP_AR', 'PRINCIPAL_INVOICE', 'CLOSED') NOT NULL DEFAULT 'INQUIRY',
  status ENUM('INQUIRY', 'QUOTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED') NOT NULL DEFAULT 'INQUIRY',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_vessel_calls_stage_status (current_stage, status),
  INDEX idx_vessel_calls_port (port_id),
  INDEX idx_vessel_calls_customer (customer_id),
  CONSTRAINT fk_vessel_calls_vessel FOREIGN KEY (vessel_id) REFERENCES vessels(id),
  CONSTRAINT fk_vessel_calls_port FOREIGN KEY (port_id) REFERENCES ports(id),
  CONSTRAINT fk_vessel_calls_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inquiries (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  inquiry_no VARCHAR(60) NOT NULL UNIQUE,
  inquiry_date DATE NOT NULL,
  eta_remarks TEXT,
  etd_remarks TEXT,
  quantity DECIMAL(18,4),
  quantity_unit ENUM('MATRIX_TON', 'TON'),
  cargo_details TEXT NOT NULL,
  estimated_days DECIMAL(12,4) NOT NULL DEFAULT 0 CHECK (estimated_days >= 0),
  special_requirements TEXT,
  status ENUM('RECEIVED', 'EVALUATED', 'CONVERTED') NOT NULL DEFAULT 'RECEIVED',
  created_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  created_by_name VARCHAR(150),
  created_by_branch VARCHAR(150),
  created_by_branch_code VARCHAR(30),
  CONSTRAINT fk_inquiries_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_inquiries_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotations (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  quote_type ENUM('EPDA', 'PDA') NOT NULL,
  quote_no VARCHAR(80) NOT NULL UNIQUE,
  quote_date DATE NOT NULL,
  currency ENUM('IDR', 'USD') NOT NULL,
  exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 15800 CHECK (exchange_rate_usd_to_idr > 0),
  total_buy_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_sell_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  margin_amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  margin_percentage DECIMAL(18,6) NOT NULL DEFAULT 0,
  status ENUM('DRAFT', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
  UNIQUE KEY uq_quotations_job_type (job_id, quote_type),
  CONSTRAINT fk_quotations_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotation_items (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  quotation_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expense_item_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  fix_tariff_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  entry_order INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  category ENUM('PORT_EXPENSES', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES', 'OWNER_MATTER', 'AGENCY_FEE', 'TAX_CONTINGENCY', 'PORT_DUES', 'PILOTAGE_TOWAGE', 'BERTHING', 'CREW_CHANGE', 'IMMIGRATION_CUSTOMS', 'LOGISTICS_SUPPLIES', 'SUNDRY') NOT NULL,
  basis TEXT,
  quantity DECIMAL(18,6) NOT NULL DEFAULT 1,
  unit_buy_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  unit_sell_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_buy_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_sell_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  currency ENUM('IDR', 'USD') NOT NULL,
  tariff_type ENUM('FIXED', 'VARIABLE', 'RANGE'),
  calculation_basis ENUM('PER_GRT', 'PER_DAY', 'LUMP_SUM', 'PER_HOUR', 'PER_MOVE'),
  tariff_rate DECIMAL(30,12),
  remarks TEXT,
  UNIQUE KEY uq_quotation_items_order (quotation_id, entry_order),
  INDEX idx_quotation_items_order (quotation_id, entry_order),
  CONSTRAINT fk_quotation_items_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT fk_quotation_items_expense FOREIGN KEY (expense_item_id) REFERENCES expenses_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_quotation_items_tariff FOREIGN KEY (fix_tariff_id) REFERENCES fix_tariffs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crew_change_plans (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  plan_date DATE NOT NULL,
  sign_on_count INT NOT NULL DEFAULT 0 CHECK (sign_on_count >= 0),
  sign_off_count INT NOT NULL DEFAULT 0 CHECK (sign_off_count >= 0),
  logistics_cost DECIMAL(30,12) NOT NULL DEFAULT 0,
  immigration_visa_cost DECIMAL(30,12) NOT NULL DEFAULT 0,
  transport_cost DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_cost_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_cost_idr DECIMAL(30,12) NOT NULL DEFAULT 0,
  status ENUM('PLANNED', 'IN_TRANSIT', 'COMPLETED') NOT NULL DEFAULT 'PLANNED',
  CONSTRAINT fk_crew_change_plans_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crew_members (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  crew_change_plan_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(150) NOT NULL,
  passport_number VARCHAR(80) NOT NULL,
  seaman_book VARCHAR(80) NOT NULL,
  rank VARCHAR(100) NOT NULL,
  nationality VARCHAR(100) NOT NULL,
  crew_type ENUM('SIGN_ON', 'SIGN_OFF') NOT NULL,
  flight_details TEXT,
  hotel_booked BOOLEAN NOT NULL DEFAULT FALSE,
  transit_cost_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  immigration_status ENUM('PENDING', 'CLEARED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  CONSTRAINT fk_crew_members_plan FOREIGN KEY (crew_change_plan_id) REFERENCES crew_change_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manager_approvals (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  approved_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  approved_by_name VARCHAR(150),
  approved_at DATETIME(3),
  notes TEXT,
  allowed_margin_tolerance_pct DECIMAL(18,6) NOT NULL DEFAULT 0,
  CONSTRAINT fk_manager_approvals_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_manager_approvals_user FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE operational_data (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  ata DATETIME(3),
  atb DATETIME(3),
  atd DATETIME(3),
  pilot_on_board_time DATETIME(3),
  pilot_off_time DATETIME(3),
  berth_zone_name VARCHAR(150),
  cargo_quantity_metric_tons DECIMAL(18,4),
  cargo_commodity VARCHAR(150),
  harbor_master_clearance_no VARCHAR(100),
  CONSTRAINT fk_operational_data_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE statements_of_fact (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_time DATETIME(3) NOT NULL,
  event VARCHAR(200) NOT NULL,
  remarks TEXT,
  INDEX idx_statements_of_fact_job_time (job_id, event_time),
  CONSTRAINT fk_statements_of_fact_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE actual_costs (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  item_code VARCHAR(60) NOT NULL,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(80) NOT NULL,
  vendor_name VARCHAR(200) NOT NULL,
  invoice_or_voucher_no VARCHAR(100) NOT NULL,
  cost_date DATE NOT NULL,
  quantity DECIMAL(18,6),
  amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  currency ENUM('IDR', 'USD') NOT NULL,
  tariff_type ENUM('FIXED', 'VARIABLE', 'RANGE'),
  calculation_basis ENUM('PER_GRT', 'PER_DAY', 'LUMP_SUM', 'PER_HOUR', 'PER_MOVE'),
  tariff_rate DECIMAL(30,12),
  pda_amount_estimated DECIMAL(30,12) NOT NULL DEFAULT 0,
  variance_amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  status ENUM('PENDING_VERIFICATION', 'VERIFIED', 'APPROVED_BY_FDA') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  attachment_name VARCHAR(255),
  attachment_data_url LONGTEXT,
  remarks TEXT,
  INDEX idx_actual_costs_job_status (job_id, status),
  CONSTRAINT fk_actual_costs_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fda_records (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  fda_no VARCHAR(80) NOT NULL UNIQUE,
  fda_date DATE NOT NULL,
  currency ENUM('IDR', 'USD'),
  exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 15800 CHECK (exchange_rate_usd_to_idr > 0),
  total_estimated_buy DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_estimated_sell DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_actual_cost DECIMAL(30,12) NOT NULL DEFAULT 0,
  final_billed_to_principal DECIMAL(30,12) NOT NULL DEFAULT 0,
  variance_amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  variance_percentage DECIMAL(18,6) NOT NULL DEFAULT 0,
  fda_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  submitted_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  submitted_by_name VARCHAR(150),
  submitted_at DATETIME(3),
  approved_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  approved_by_name VARCHAR(150),
  approved_at DATETIME(3),
  notes TEXT,
  pdf_file_name VARCHAR(255),
  pdf_data_url LONGTEXT,
  CONSTRAINT fk_fda_records_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_fda_records_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fda_records_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ap_items (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  voucher_no VARCHAR(100) NOT NULL,
  vendor_name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  currency ENUM('IDR', 'USD') NOT NULL,
  status ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
  payment_ref VARCHAR(100),
  paid_date DATE,
  INDEX idx_ap_items_job_status (job_id, status),
  CONSTRAINT fk_ap_items_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ar_items (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reference_no VARCHAR(100) NOT NULL,
  principal_name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  requested_amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  received_amount DECIMAL(30,12) NOT NULL DEFAULT 0,
  currency ENUM('IDR', 'USD') NOT NULL,
  received_date DATE,
  bank_account VARCHAR(150),
  status ENUM('AWAITING_REMITTANCE', 'RECEIVED', 'OVERDUE') NOT NULL DEFAULT 'AWAITING_REMITTANCE',
  INDEX idx_ar_items_job_status (job_id, status),
  CONSTRAINT fk_ar_items_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE principal_invoices (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  invoice_no VARCHAR(100) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  total_amount_idr DECIMAL(30,12) NOT NULL DEFAULT 0,
  advance_deducted_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  advance_deducted_idr DECIMAL(30,12) NOT NULL DEFAULT 0,
  balance_due_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  balance_due_idr DECIMAL(30,12) NOT NULL DEFAULT 0,
  status ENUM('DRAFT', 'ISSUED', 'SETTLED') NOT NULL DEFAULT 'DRAFT',
  pdf_generated BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_principal_invoices_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE principal_receipts (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  received_date DATE NOT NULL,
  amount DECIMAL(30,12) NOT NULL CHECK (amount > 0),
  currency ENUM('IDR', 'USD') NOT NULL,
  payment_type ENUM('ADVANCE_PAYMENT', 'INVOICE') NOT NULL,
  bank_remark TEXT NOT NULL,
  attachment_name VARCHAR(255),
  attachment_data_url LONGTEXT,
  INDEX idx_receipts_job_date (job_id, received_date),
  CONSTRAINT fk_principal_receipts_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE closing_records (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at DATETIME(3),
  closed_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  closed_by_name VARCHAR(150),
  final_gross_margin_usd DECIMAL(30,12) NOT NULL DEFAULT 0,
  final_gross_margin_idr DECIMAL(30,12) NOT NULL DEFAULT 0,
  post_voyage_remarks TEXT,
  CONSTRAINT fk_closing_records_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_closing_records_user FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  logged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  actor_name VARCHAR(150) NOT NULL,
  actor_role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE') NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  description TEXT NOT NULL,
  INDEX idx_audit_logs_entity (entity, entity_id),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;