CREATE TABLE IF NOT EXISTS pda_number_sequences (
  year SMALLINT UNSIGNED NOT NULL,
  branch_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_sequence INT UNSIGNED NOT NULL,
  PRIMARY KEY (year, branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pda_number_issues (
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  branch_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  pda_no VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pda_number_issues_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_pda_number_issues_sequence FOREIGN KEY (year, branch_code) REFERENCES pda_number_sequences(year, branch_code),
  UNIQUE KEY uq_pda_number_issues_sequence (year, branch_code, sequence_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
