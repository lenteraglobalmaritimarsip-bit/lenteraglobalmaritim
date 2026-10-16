ALTER TABLE quotations
  ADD COLUMN eta DATETIME(3) NULL AFTER quote_date,
  ADD COLUMN etd DATETIME(3) NULL AFTER eta,
  ADD COLUMN eta_remarks TEXT NULL AFTER etd,
  ADD COLUMN etd_remarks TEXT NULL AFTER eta_remarks;
