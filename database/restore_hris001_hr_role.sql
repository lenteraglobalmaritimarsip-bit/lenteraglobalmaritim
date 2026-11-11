-- Restore only the HRIS001 account if it is currently assigned to the LGF HR role.
-- Review the selected account before committing the transaction.

START TRANSACTION;

SELECT id, username, role
FROM users
WHERE username = 'HRIS001'
FOR UPDATE;

UPDATE users
SET role = 'HR_ADMINISTRASI'
WHERE username = 'HRIS001'
  AND role = 'HR_ADMINISTRASI_LGF';

SELECT id, username, role
FROM users
WHERE username = 'HRIS001';

COMMIT;
