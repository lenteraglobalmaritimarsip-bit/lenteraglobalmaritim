ALTER TABLE hr_employee_records
  ADD COLUMN religion ENUM('Islam', 'Kristen Protestan', 'Katolik', 'Hindu', 'Buddha', 'Konghucu') NULL
  AFTER employment_status;
