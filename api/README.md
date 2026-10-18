# XAMPP API Setup

The PHP API connects to MariaDB with PDO. The local default database name matches the XAMPP database used in the setup (`maritim lgm`). For a different database or credentials, copy `config.local.example.php` to `config.local.php` and edit it. `config.local.php` is ignored by Git. Do not use the XAMPP `root` account or a blank password on a public server.

1. Import `database/schema.sql` into the application database to create the complete schema, including the PIC Name, Alamat, and No Tlp columns for Vendor Partners. For an existing database, apply `database/migrations/20261010_add_user_app_data.sql`, `database/migrations/20261010_add_payment_voucher_payment_costs.sql`, `database/migrations/20261015_add_epda_eta_etd.sql`, `database/migrations/20261015_add_fda_eta_etd.sql`, `database/migrations/20261016_add_global_vat.sql`, `database/migrations/20261016_add_payment_voucher_proof.sql`, `database/migrations/20261017_add_pda_numbering.sql`, `database/migrations/20261017_add_fpda_number_sequences.sql`, `database/migrations/20261017_add_pda_form.sql`, and `database/migrations/20261018_create_accounts_receivable_entries.sql` for per-user drafts, notification read state, Account Payable payment details, separate EPDA/FDA ETA/ETD fields, global VAT options, stored payment proof images, yearly PDA/FPDA number sequences, autosaved PDA forms, and Accounts Receivable entries with cash receipt photos.
   On an older database also apply `database/migrations/20261016_cleanup_unused_schema.sql` (drops unused tables/columns; MariaDB 10.5+).
2. From the project root, create the first administrator. The generated password is printed once; save it securely.

```powershell
C:\xampp\php\php.exe api\create_admin.php
```

If the one-time password was lost, reset it from the project root with `C:\xampp\php\php.exe api\reset_admin_password.php`. This generates and prints a new password once; it does not expose or recover the old password.

3. Start the Vite app and PHP API together from the project root:

```powershell
npm run dev
```

On Windows, the dev server automatically detects PHP installed under Laragon or XAMPP. Otherwise, put `php` on `PATH` or set `PHP_EXECUTABLE` to the PHP executable path. The Vite dev server proxies `/api` to PHP at `localhost:8000`.

4. Set `VITE_API_AUTH_ENABLED=true` in the ignored `.env.local` file and restart Vite. API mode is required; the application does not persist data in browser storage or fall back to local storage when the API is unavailable.
5. Sign in using the generated admin account. On an empty database, the first admin session seeds the app's initial master data. Add real role accounts in Admin > Users; demo password presets are hidden in API mode.

The API uses `HttpOnly` PHP sessions, CSRF tokens, password hashes, PDO prepared statements, and a configurable allowed origin. Use HTTPS outside localhost.

The app state maps to relational tables in a transaction. Root master and Job records are upserted rather than deleted and reinserted, so foreign-key cascades cannot remove durable PDA/FPDA documents during state synchronization. User-specific drafts and notification read state are stored in `user_app_data`, keyed to the authenticated user. The API uses an HttpOnly session cookie; the browser retains only that session cookie, not application data. The adapter is intended for local workflow testing with one active browser session. Before multi-user/public deployment, replace whole-state synchronization with revision-checked incremental writes and enforce per-workflow permissions server-side.

PDA numbers and autosaved PDA drafts are managed by `api/pda.php` using the authenticated user's branch and the `Asia/Jakarta` calendar year/month. Sales PDA numbers use the format `0001/PDA-LGM-BRANCH/MM/YYYY`, starting at `0001` for each branch and year; EPDA must exist before a Sales PDA can be opened. FPDA numbers use a separate sequence in the format `0001/FPDA-LGM-BRANCH/MM/YYYY`, also starting at `0001` for each branch and year. Autosave updates the existing document revision and does not allocate a new number. Header fields, item rows, and the in-progress item form are stored in the `pda_documents` and `pda_items` tables, with revision checks to prevent silent overwrites between sessions. FDA users can continue items from the same Job's Sales PDA; copied item details are appended and source-to-FPDA item references are autosaved to avoid repeated imports.
