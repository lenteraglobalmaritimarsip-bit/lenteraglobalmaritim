CREATE TABLE IF NOT EXISTS fpda_number_sequences (
  year SMALLINT UNSIGNED NOT NULL,
  branch_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_sequence INT UNSIGNED NOT NULL,
  PRIMARY KEY (year, branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;