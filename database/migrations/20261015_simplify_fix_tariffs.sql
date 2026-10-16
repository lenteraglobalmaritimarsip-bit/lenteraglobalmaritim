UPDATE fix_tariffs
SET rate_idr = CASE
      WHEN currency = 'IDR' AND (rate_idr IS NULL OR rate_idr = 0) THEN rate
      ELSE rate_idr
    END,
    rate_usd = CASE
      WHEN currency = 'USD' AND (rate_usd IS NULL OR rate_usd = 0) THEN rate
      ELSE rate_usd
    END;

UPDATE fix_tariffs
SET grt_min = ROUND(grt),
    grt_max = ROUND(grt)
WHERE COALESCE(grt_min, 0) <= 0
  AND COALESCE(grt_max, 0) <= 0
  AND COALESCE(grt, 0) > 0;

UPDATE fix_tariffs
SET grt_min = ROUND(grt_min),
    grt_max = ROUND(grt_max);

ALTER TABLE fix_tariffs
  DROP COLUMN service_code,
  DROP COLUMN grt,
  DROP COLUMN rate,
  DROP COLUMN min_charge,
  DROP COLUMN description,
  MODIFY COLUMN grt_min INT NULL,
  MODIFY COLUMN grt_max INT NULL;
