ALTER TABLE accounts_receivable_entries
  ADD COLUMN coa_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER pph23_amount_idr,
  ADD INDEX idx_accounts_receivable_coa (coa_id),
  ADD CONSTRAINT fk_accounts_receivable_coa FOREIGN KEY (coa_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;
