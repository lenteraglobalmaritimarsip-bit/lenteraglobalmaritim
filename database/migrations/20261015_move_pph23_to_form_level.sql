ALTER TABLE quotations
  ADD COLUMN pph23_applied TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE fda_records
  ADD COLUMN pph23_applied TINYINT(1) NOT NULL DEFAULT 0;

UPDATE quotations q
SET q.pph23_applied = 1
WHERE q.quote_type = 'EPDA'
  AND EXISTS (
    SELECT 1
    FROM quotation_items qi
    WHERE qi.quotation_id = q.id
      AND qi.pph23_applied = 1
  );

UPDATE fda_records f
SET f.pph23_applied = 1
WHERE EXISTS (
  SELECT 1
  FROM actual_costs ac
  WHERE ac.job_id = f.job_id
    AND ac.pph23_applied = 1
);
