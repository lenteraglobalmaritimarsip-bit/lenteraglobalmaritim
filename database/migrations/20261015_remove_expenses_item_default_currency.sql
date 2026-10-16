UPDATE expenses_items
SET rate_idr = CASE
      WHEN default_currency = 'IDR' AND (rate_idr IS NULL OR rate_idr = 0) THEN standard_cost_sell
      ELSE rate_idr
    END,
    rate_usd = CASE
      WHEN default_currency = 'USD' AND (rate_usd IS NULL OR rate_usd = 0) THEN standard_cost_sell
      ELSE rate_usd
    END;

ALTER TABLE expenses_items
  DROP COLUMN default_currency;
