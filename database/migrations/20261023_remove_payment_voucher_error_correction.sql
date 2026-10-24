ALTER TABLE payment_vouchers
  ADD COLUMN payment_history JSON NULL;

DROP PROCEDURE IF EXISTS migrate_payment_voucher_history;
DELIMITER //
CREATE PROCEDURE migrate_payment_voucher_history()
BEGIN
  DECLARE finished TINYINT DEFAULT 0;
  DECLARE voucher_id VARCHAR(100);
  DECLARE correction_data LONGTEXT;
  DECLARE history_json LONGTEXT;
  DECLARE history_index INT UNSIGNED;
  DECLARE voucher_cursor CURSOR FOR
    SELECT id, payment_correction_data FROM payment_vouchers;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

  OPEN voucher_cursor;
  migrate_rows: LOOP
    FETCH voucher_cursor INTO voucher_id, correction_data;
    IF finished = 1 THEN
      LEAVE migrate_rows;
    END IF;

    SET history_json = IF(
      JSON_VALID(correction_data),
      JSON_EXTRACT(correction_data, '$.paymentHistory'),
      JSON_ARRAY()
    );
    IF history_json IS NULL OR JSON_TYPE(history_json) <> 'ARRAY' THEN
      SET history_json = JSON_ARRAY();
    END IF;

    SET history_index = 0;
    WHILE history_index < JSON_LENGTH(history_json) DO
      SET history_json = JSON_REMOVE(
        history_json,
        CONCAT('$[', history_index, '].correctionReason')
      );
      SET history_index = history_index + 1;
    END WHILE;

    UPDATE payment_vouchers
    SET payment_history = history_json,
        voucher_number = CASE
          WHEN status = 'APPROVED'
            AND JSON_UNQUOTE(JSON_EXTRACT(correction_data, '$.errorCorrection.status')) = 'OPEN'
          THEN NULL
          ELSE voucher_number
        END
    WHERE id = voucher_id;
  END LOOP;
  CLOSE voucher_cursor;
END//
DELIMITER ;

CALL migrate_payment_voucher_history();
DROP PROCEDURE migrate_payment_voucher_history;

UPDATE payment_vouchers
SET payment_description = CASE
  WHEN payment_description LIKE 'Error Correction %' THEN NULL
  ELSE SUBSTRING_INDEX(payment_description, ' | Error Correction ', 1)
END
WHERE payment_description LIKE '%Error Correction%';

DELETE FROM audit_logs
WHERE entity = 'PAYMENT_VOUCHER'
  AND action IN ('ERROR_CORRECTION', 'ERROR_CORRECTION_PAID');

ALTER TABLE payment_vouchers
  DROP COLUMN payment_correction_data;