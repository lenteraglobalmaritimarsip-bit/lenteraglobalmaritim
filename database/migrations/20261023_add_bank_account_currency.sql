ALTER TABLE bank_accounts
  ADD COLUMN currency ENUM('IDR', 'USD') NOT NULL DEFAULT 'IDR' AFTER account_number;

UPDATE bank_accounts
SET currency = 'USD'
WHERE account_number = '1200055755990';

UPDATE bank_accounts
SET currency = 'IDR'
WHERE account_number IN ('1200055755883', '2824121209');
