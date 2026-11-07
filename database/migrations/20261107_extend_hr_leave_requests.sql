ALTER TABLE hr_leave_requests
  MODIFY COLUMN leave_type ENUM('ANNUAL', 'BUSINESS_TRAVEL', 'SICK', 'PERSONAL', 'OTHER') NOT NULL,
  ADD COLUMN duration_days SMALLINT UNSIGNED NULL AFTER ends_on,
  ADD COLUMN destination_city VARCHAR(120) NULL AFTER duration_days,
  ADD COLUMN transport_mode ENUM('CAR', 'PLANE', 'TRAIN', 'PUBLIC_BUS') NULL AFTER destination_city;
