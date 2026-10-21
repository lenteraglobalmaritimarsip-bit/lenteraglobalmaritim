ALTER TABLE accounts_receivable_entries
  ADD COLUMN exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 0
  AFTER usd_amount;

ALTER TABLE principal_receipts
  ADD COLUMN exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 0
  AFTER currency;

UPDATE accounts_receivable_entries ar
LEFT JOIN vessel_calls vc ON vc.job_id = ar.job_id
LEFT JOIN fda_records f ON f.job_id = ar.job_id
LEFT JOIN pda_documents pd ON pd.job_id = ar.job_id AND pd.pda_no = ar.invoice_no AND pd.pda_type = 'FDA'
SET ar.exchange_rate_usd_to_idr = CASE
  WHEN ar.invoice_type = 'FPDA' THEN COALESCE(NULLIF(pd.exchange_rate, 0), vc.exchange_rate_usd_to_idr, 0)
  ELSE COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr, 0)
END
WHERE ar.subject_data = 'PRINCIPAL' AND ar.usd_amount > 0;

UPDATE principal_receipts pr
LEFT JOIN vessel_calls vc ON vc.job_id = pr.job_id
LEFT JOIN fda_records f ON f.job_id = pr.job_id
SET pr.exchange_rate_usd_to_idr = COALESCE(NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 0)
WHERE pr.currency = 'USD';