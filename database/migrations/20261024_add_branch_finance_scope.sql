ALTER TABLE bank_accounts
  ADD COLUMN branch_name VARCHAR(150) NOT NULL DEFAULT '' AFTER branch,
  ADD INDEX idx_bank_accounts_branch (branch_name);

ALTER TABLE cash_balance_adjustments
  ADD COLUMN branch_name VARCHAR(150) NOT NULL DEFAULT '' AFTER bank_account_id,
  ADD INDEX idx_cash_balance_adjustments_branch_date (branch_name, effective_date);

UPDATE cash_balance_adjustments cba
INNER JOIN bank_accounts account ON account.id = cba.bank_account_id
SET cba.branch_name = account.branch_name
WHERE cba.branch_name = '';

ALTER TABLE payment_vouchers
  ADD COLUMN branch_name VARCHAR(150) NOT NULL DEFAULT '' AFTER request_number,
  ADD INDEX idx_payment_vouchers_branch_date (branch_name, request_date);

UPDATE payment_vouchers pv
LEFT JOIN users requester ON requester.id = pv.request_by_user_id
LEFT JOIN bank_accounts account ON account.id = pv.paid_from_bank_account_id
SET pv.branch_name = COALESCE(
  NULLIF(TRIM(requester.branch_name), ''),
  NULLIF(TRIM(account.branch_name), ''),
  ''
)
WHERE pv.branch_name = '';

ALTER TABLE accounts_receivable_entries
  ADD COLUMN branch_name VARCHAR(150) NOT NULL DEFAULT '' AFTER id,
  ADD INDEX idx_accounts_receivable_branch_date (branch_name, income_date);

UPDATE accounts_receivable_entries ar
LEFT JOIN bank_accounts account ON account.id = ar.bank_account_id
LEFT JOIN inquiries inquiry ON inquiry.job_id = ar.job_id
SET ar.branch_name = COALESCE(
  NULLIF(TRIM(account.branch_name), ''),
  NULLIF(TRIM(inquiry.created_by_branch), ''),
  ''
)
WHERE ar.branch_name = '';
