ALTER TABLE vessel_calls
  ADD COLUMN voided_at DATETIME(3) NULL,
  ADD COLUMN voided_by_name VARCHAR(150) NULL,
  ADD COLUMN void_reason TEXT NULL;
