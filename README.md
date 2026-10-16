# MARITIMPORT — SHIPPING AGENCY WORK PORTAL

Portal kerja Shipping Agency berbasis React + TypeScript + Vite.

## Alur utama

START → SALES / INQUIRY → QUOTATION (EPDA) → MANAGER APPROVAL → OPERATIONS / FDA → PRINCIPAL INVOICE → CLOSING

**Aturan utama:** 1 Job / Vessel Call = 1 Job ID. Contoh: `VC-2026-0098`.

## Cara menjalankan di Windows + VS Code

### 1. Install Node.js
Gunakan Node.js versi LTS.

### 2. Extract ZIP
Klik kanan file ZIP → **Extract All**. Jangan membuka file JSX/TSX satu per satu dari ZIP.

### 3. Buka folder di VS Code
VS Code → **File → Open Folder** → pilih folder yang berisi `package.json`.

### 4. Buka Terminal
Di VS Code pilih **Terminal → New Terminal**.

Pastikan terminal berada di folder project. Cek:

```powershell
npm -v
node -v
```

### 5. Install dependency
Jalankan satu kali:

```powershell
npm install
```

### 6. Jalankan portal

```powershell
npm run dev
```

Kemudian buka alamat yang ditampilkan Vite, biasanya:

`http://localhost:3000`

### 7. Menghentikan portal
Di terminal tekan `Ctrl + C`.

## Jika ingin menjalankan lagi
Tidak perlu `npm install` setiap kali. Cukup:

```powershell
npm run dev
```

## Jika muncul error dependency
Hapus folder `node_modules` dan file `package-lock.json`, lalu:

```powershell
npm install
npm run dev
```

## Catatan data
Data aplikasi disimpan di **MariaDB melalui PHP API** (`api/`). Browser tidak menyimpan data aplikasi (hanya cookie sesi HttpOnly).
Setup database, akun admin pertama, dan migrasi: lihat [api/README.md](api/README.md). Skema lengkap ada di `database/schema.sql`;
database lama cukup menjalankan file di `database/migrations/` berurutan (terbaru: `20261016_add_payment_voucher_proof.sql`).

## Struktur modul
- Dashboard
- Sales / Inquiry
- Quotation — EPDA
- Manager Approval
- Operations / FDA
- Actual Cost
- AP / AR
- Principal Invoice
- Closing
- Master Data
- Job Hierarchy / Job Detail

## Struktur Job
Semua transaksi ditautkan ke Job/Vessel Call ID yang sama:

`VC-2026-0098`

├── Inquiry
├── Quotation
│   └── EPDA
├── Manager Approval
├── Operations / FDA
│   ├── Operational Data
│   ├── Actual Cost
│   └── AP / AR Monitoring
├── Principal Invoice
└── Closing


## UI Update
The portal now opens in the SALES workspace with a light enterprise dashboard inspired by the provided LGM Keagenan reference: blue top header, navy left navigation, KPI cards, inquiry/quotation panels, active vessel calls and quick actions. Other modules retain their functions and are visually skinned to the same light workspace.

## Login & Active User
Login memakai akun di tabel `users` (PHP session + CSRF). Akun admin pertama dibuat lewat `api/create_admin.php`
(password acak 8 digit dicetak satu kali); akun role lain dibuat di **Admin > Users**. Tidak ada akun/password demo.
User aktif tampil di header dan dapat logout.
