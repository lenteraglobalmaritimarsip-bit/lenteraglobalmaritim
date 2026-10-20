ALTER TABLE payment_voucher_items
  ADD COLUMN document_type ENUM('FDA', 'FPDA') NULL AFTER job_number,
  ADD COLUMN document_number VARCHAR(180) NULL AFTER document_type;
