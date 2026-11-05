SET @users_email_unique_index = (
  SELECT MIN(index_name)
  FROM (
    SELECT index_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND non_unique = 0
    GROUP BY index_name
    HAVING COUNT(*) = 1 AND MAX(column_name) = 'email'
  ) AS email_unique_indexes
);

SET @drop_users_email_unique_index = IF(
  @users_email_unique_index IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE `users` DROP INDEX `',
    REPLACE(@users_email_unique_index, '`', '``'),
    '`'
  )
);

PREPARE drop_users_email_unique_index_statement FROM @drop_users_email_unique_index;
EXECUTE drop_users_email_unique_index_statement;
DEALLOCATE PREPARE drop_users_email_unique_index_statement;
