ALTER TABLE hr_employee_records
  ADD COLUMN bpjs_ketenagakerjaan VARCHAR(30) NULL AFTER npwp,
  ADD COLUMN bpjs_kesehatan VARCHAR(30) NULL AFTER bpjs_ketenagakerjaan;
