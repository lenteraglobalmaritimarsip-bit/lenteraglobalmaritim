-- DANGER: permanently deletes every Sales PDA and FPDA document on every branch,
-- including drafts and approved documents. Back up the production database first.
--
-- Run the preflight query separately. If either reference count is non-zero,
-- stop and review those Finance references before running the reset section.
-- Finance records are kept.
--
-- In pda_documents, pda_type = 'SALES' is PDA and pda_type = 'FDA' is FPDA.

SELECT
  pd.job_id,
  pd.pda_type,
  pd.pda_no,
  pd.approval_status,
  (SELECT COUNT(*)
   FROM accounts_receivable_entries ar
   WHERE ar.invoice_no = pd.pda_no) AS receivable_references,
  (SELECT COUNT(*)
   FROM payment_voucher_items pvi
   WHERE pvi.document_number = pd.pda_no) AS payment_voucher_references
FROM pda_documents pd
WHERE pd.pda_type IN ('SALES', 'FDA')
ORDER BY pd.pda_type, pd.branch_code, pd.pda_no;

-- After reviewing the preflight results, run this reset section.
START TRANSACTION;

DELETE FROM pda_items
WHERE pda_type IN ('SALES', 'FDA');

DELETE FROM pda_documents
WHERE pda_type IN ('SALES', 'FDA');

DELETE FROM pda_number_sequences;
DELETE FROM fpda_number_sequences;

-- Verify the document and sequence tables are empty before committing.
SELECT
  (SELECT COUNT(*) FROM pda_documents WHERE pda_type IN ('SALES', 'FDA')) AS remaining_documents,
  (SELECT COUNT(*) FROM pda_items WHERE pda_type IN ('SALES', 'FDA')) AS remaining_items,
  (SELECT COUNT(*) FROM pda_number_sequences) AS remaining_pda_sequences,
  (SELECT COUNT(*) FROM fpda_number_sequences) AS remaining_fpda_sequences;

-- New PDA/FPDA numbers will start at 0001 per branch and year.
-- Finance records, jobs, FDA records, and unrelated number sequences are not deleted.
COMMIT;
