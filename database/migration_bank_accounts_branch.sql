-- Add the Branch field to Bank Account master data.
-- Run once against an existing database.

ALTER TABLE bank_accounts
  ADD COLUMN branch VARCHAR(150) NULL AFTER bank_name;