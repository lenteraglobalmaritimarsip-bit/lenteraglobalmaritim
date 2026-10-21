ALTER TABLE accounts_receivable_entries
  ADD COLUMN payment_type ENUM('ADVANCE_PAYMENT', 'INVOICE') NOT NULL DEFAULT 'ADVANCE_PAYMENT'
    AFTER invoice_type,
  ADD COLUMN invoice_allocation_status ENUM('AUTO', 'MANUAL_REQUIRED', 'APPLIED', 'NOT_APPLICABLE')
    NOT NULL DEFAULT 'AUTO' AFTER payment_type,
  ADD INDEX idx_accounts_receivable_invoice_allocation (job_id, invoice_allocation_status);

UPDATE accounts_receivable_entries
SET payment_type = CASE
  WHEN invoice_type = 'FPDA' THEN 'INVOICE'
  ELSE 'ADVANCE_PAYMENT'
END,
invoice_allocation_status = CASE
  WHEN subject_data = 'PRINCIPAL' THEN 'AUTO'
  ELSE 'NOT_APPLICABLE'
END;