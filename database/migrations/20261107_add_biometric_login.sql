CREATE TABLE auth_biometric_credentials (
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  device_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  public_key_der VARCHAR(1400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, device_id),
  CONSTRAINT fk_biometric_credential_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_biometric_challenges (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  device_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purpose ENUM('ENROLL', 'LOGIN') NOT NULL,
  challenge_value CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_biometric_challenge_rate (user_id, device_id, created_at),
  CONSTRAINT fk_biometric_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
