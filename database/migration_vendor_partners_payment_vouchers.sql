-- Migration: add Vendor Partners master data table to an existing database.
-- Safe to run more than once.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS vendor_partners (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  vendor_name VARCHAR(200) NOT NULL,
  bank_name VARCHAR(150),
  paid_name VARCHAR(200),
  account_number VARCHAR(80),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_vendor_partners_name (vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bank_name VARCHAR(200) NOT NULL,
  branch VARCHAR(150),
  account_name VARCHAR(200) NOT NULL,
  account_number VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_bank_accounts_name (bank_name, account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment Vouchers (Request Payment > Create Voucher)
CREATE TABLE IF NOT EXISTS payment_vouchers (
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

CREATE TABLE IF NOT EXISTS payment_voucher_items (
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
-- Untuk database yang SUDAH punya tabel payment_vouchers (tanpa kolom approval), jalankan:
-- ALTER TABLE payment_vouchers
--   ADD COLUMN status ENUM('PENDING_MANAGER','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'PENDING_MANAGER' AFTER total_paid_amount,
--   ADD COLUMN manager_note TEXT NULL AFTER status,
--   ADD COLUMN reviewed_by VARCHAR(200) NULL AFTER manager_note,
--   ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by,
--   ADD COLUMN paid_by VARCHAR(200) NULL AFTER reviewed_at,
--   ADD COLUMN paid_at DATETIME(3) NULL AFTER paid_by;
