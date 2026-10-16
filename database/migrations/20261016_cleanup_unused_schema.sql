-- Removes schema objects that no API/UI flow reads or writes. MariaDB 10.5+ (XAMPP) syntax: IF EXISTS makes it re-runnable.
-- Back up the database first. Foreign keys are dropped before their columns.

DROP TABLE IF EXISTS branches;

ALTER TABLE manager_approvals DROP FOREIGN KEY IF EXISTS fk_manager_approvals_user;
ALTER TABLE manager_approvals DROP COLUMN IF EXISTS approved_by_user_id;

ALTER TABLE fda_records DROP FOREIGN KEY IF EXISTS fk_fda_records_submitted_by;
ALTER TABLE fda_records DROP FOREIGN KEY IF EXISTS fk_fda_records_approved_by;
ALTER TABLE fda_records DROP COLUMN IF EXISTS submitted_by_user_id;
ALTER TABLE fda_records DROP COLUMN IF EXISTS approved_by_user_id;

ALTER TABLE closing_records DROP FOREIGN KEY IF EXISTS fk_closing_records_user;
ALTER TABLE closing_records DROP COLUMN IF EXISTS closed_by_user_id;

ALTER TABLE quotation_items DROP FOREIGN KEY IF EXISTS fk_quotation_items_tariff;
ALTER TABLE quotation_items DROP COLUMN IF EXISTS fix_tariff_id;
ALTER TABLE quotation_items DROP INDEX IF EXISTS idx_quotation_items_order;

ALTER TABLE fix_tariffs DROP COLUMN IF EXISTS port_name;
ALTER TABLE zones DROP INDEX IF EXISTS idx_zones_port;

ALTER TABLE operational_data
  DROP COLUMN IF EXISTS pilot_on_board_time,
  DROP COLUMN IF EXISTS pilot_off_time,
  DROP COLUMN IF EXISTS cargo_quantity_metric_tons,
  DROP COLUMN IF EXISTS cargo_commodity,
  DROP COLUMN IF EXISTS harbor_master_clearance_no;
