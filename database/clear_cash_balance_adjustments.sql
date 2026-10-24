-- Permanently deletes cash balance adjustment history only.
-- This resets balances derived from these adjustments; bank accounts and other data are unchanged.

START TRANSACTION;

DELETE FROM cash_balance_adjustments;
SELECT ROW_COUNT() AS deleted_adjustment_count;

COMMIT;
