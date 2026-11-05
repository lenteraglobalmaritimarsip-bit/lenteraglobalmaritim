ALTER TABLE payment_vouchers
  ADD COLUMN payment_journal_lines JSON NULL AFTER payment_history;

ALTER TABLE accounts_receivable_entries
  ADD COLUMN journal_lines JSON NULL AFTER coa_id;
