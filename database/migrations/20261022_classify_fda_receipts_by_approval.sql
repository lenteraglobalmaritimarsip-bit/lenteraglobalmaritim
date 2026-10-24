START TRANSACTION;

UPDATE accounts_receivable_entries ar
INNER JOIN fda_records f ON f.job_id = ar.job_id
SET ar.payment_type = CASE
  WHEN ar.created_at <= f.approved_at THEN 'ADVANCE_PAYMENT'
  ELSE 'INVOICE'
END
WHERE ar.subject_data = 'PRINCIPAL'
  AND ar.invoice_type = 'FDA'
  AND (f.fda_approved = TRUE OR f.approval_status = 'APPROVED')
  AND f.approved_at IS NOT NULL;

UPDATE fda_records f
LEFT JOIN vessel_calls vc ON vc.job_id = f.job_id
SET f.advance_payment_at_approval =
  COALESCE((
    SELECT SUM(
      CASE
        WHEN COALESCE(r.currency, f.currency, vc.currency, 'IDR') = COALESCE(f.currency, vc.currency, 'IDR')
          THEN r.amount
        WHEN r.currency = 'USD' AND COALESCE(f.currency, vc.currency, 'IDR') = 'IDR'
          THEN r.amount * COALESCE(NULLIF(r.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
        ELSE r.amount / COALESCE(NULLIF(r.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
      END
      - CASE
          WHEN r.refund_status <> 'PAID' THEN 0
          WHEN COALESCE(r.currency, f.currency, vc.currency, 'IDR') = COALESCE(f.currency, vc.currency, 'IDR')
            THEN r.refund_amount
          WHEN r.currency = 'USD' AND COALESCE(f.currency, vc.currency, 'IDR') = 'IDR'
            THEN r.refund_amount * COALESCE(NULLIF(r.refund_exchange_rate_usd_to_idr, 0), NULLIF(r.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
          ELSE r.refund_amount / COALESCE(NULLIF(r.refund_exchange_rate_usd_to_idr, 0), NULLIF(r.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
        END
    )
    FROM principal_receipts r
    WHERE r.job_id = f.job_id
      AND r.payment_type = 'ADVANCE_PAYMENT'
      AND r.received_date <= DATE(f.approved_at)
      AND NOT EXISTS (
        SELECT 1
        FROM accounts_receivable_entries ar
        WHERE ar.job_id = f.job_id
          AND ar.subject_data = 'PRINCIPAL'
          AND ar.invoice_type = 'FDA'
          AND ar.payment_type = 'ADVANCE_PAYMENT'
          AND ar.created_at <= f.approved_at
          AND ar.income_date = r.received_date
          AND (
            (r.currency = 'IDR' AND ar.idr_amount > 0 AND ABS(r.amount - ar.idr_amount) < 0.005)
            OR (r.currency = 'USD' AND ar.usd_amount > 0 AND ABS(r.amount - ar.usd_amount) < 0.005)
          )
      )
  ), 0)
  + COALESCE((
    SELECT SUM(
      CASE
        WHEN COALESCE(f.currency, vc.currency, 'IDR') = 'IDR'
          THEN ar.idr_amount + ar.usd_amount * COALESCE(NULLIF(ar.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
        ELSE ar.usd_amount + ar.idr_amount / COALESCE(NULLIF(ar.exchange_rate_usd_to_idr, 0), NULLIF(f.exchange_rate_usd_to_idr, 0), vc.exchange_rate_usd_to_idr, 15800)
      END
    )
    FROM accounts_receivable_entries ar
    WHERE ar.job_id = f.job_id
      AND ar.subject_data = 'PRINCIPAL'
      AND ar.invoice_type = 'FDA'
      AND ar.payment_type = 'ADVANCE_PAYMENT'
      AND ar.created_at <= f.approved_at
  ), 0)
WHERE (f.fda_approved = TRUE OR f.approval_status = 'APPROVED')
  AND f.approved_at IS NOT NULL;

COMMIT;
