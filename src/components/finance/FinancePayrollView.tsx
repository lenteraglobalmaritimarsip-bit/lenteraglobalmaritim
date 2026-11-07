import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { deletePayrollPeriod, listPayrollBatches, savePayrollBatch, PayrollBatch, PayrollSlip } from '../../lib/api';

interface PayrollPreviewRow extends PayrollSlip {
  errors: string[];
}

const numberValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const cellValue = (row: unknown[], index: number): unknown => index >= 0 ? row[index] : undefined;
const textValue = (value: unknown): string => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value ?? '').trim();
const dateValue = (value: unknown): string => {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return '';
};
const normalizeHeader = (value: unknown): string => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[()./]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const findHeaderIndex = (sheet: XLSX.WorkSheet): { rowIndex: number; headers: string[] } | null => {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizeHeader);
    if ((headers.includes('NOMOR PEKERJA') || headers.includes('NIK')) && (headers.includes('NAME') || headers.includes('NAMA'))) {
      return { rowIndex, headers };
    }
  }
  return null;
};

const findHeader = (headers: string[], ...names: string[]): number => {
  const exact = names.map(normalizeHeader);
  return headers.findIndex((header) => exact.includes(header));
};

export const FinancePayrollView: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [preview, setPreview] = useState<PayrollPreviewRow[]>([]);
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    void listPayrollBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  const readWorkbook = async (file: File) => {
    setMessage('');
    setFileName(file.name);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const monthlySheetName = workbook.SheetNames.find((name) => /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i.test(name.trim()))
      || workbook.SheetNames.find((name) => /^20\d{2}$/.test(name.trim()));
    const sheetName = monthlySheetName || workbook.SheetNames.find((name) => name !== 'DATA UPAH BPJS' && name !== 'R') || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const detected = findHeaderIndex(sheet);
    if (!detected) throw new Error(`Sheet ${sheetName} tidak memiliki header NOMOR PEKERJA/NIK dan NAME/NAMA.`);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
    const rowNumberIndex = findHeader(detected.headers, 'NO');
    const employeeNumberIndex = findHeader(detected.headers, 'NOMOR PEKERJA', 'NIK');
    const nameIndex = findHeader(detected.headers, 'NAME', 'NAMA');
    const branchIndex = findHeader(detected.headers, 'BRANCH', 'CABANG');
    const positionIndex = findHeader(detected.headers, 'JABATAN');
    const joinedIndex = findHeader(detected.headers, 'TGL MASUK', 'DATE JOINED');
    const birthIndex = findHeader(detected.headers, 'TGL LAHIR', 'DATE OF BIRTH');
    const bankIndex = findHeader(detected.headers, 'BANK');
    const bankAccountIndex = findHeader(detected.headers, 'NO REKENING', 'NOMOR REKENING');
    const taxStatusIndex = findHeader(detected.headers, 'STATUS PTKP', 'PTKP');
    const spouseIndex = findHeader(detected.headers, 'ISTRI SUAMI', 'SPOUSE');
    const childrenIndex = findHeader(detected.headers, 'ANAK', 'CHILDREN');
    const basicIndex = findHeader(detected.headers, 'GAJI POKOK', 'BASED SALARY', 'BASIC SALARY');
    const mealsIndex = findHeader(detected.headers, 'TUNJ MAKAN', 'TUNJANGAN MAKAN', 'MEALS');
    const transportIndex = findHeader(detected.headers, 'TUNJ TRANSPORT', 'TUNJANGAN TRANSPORT', 'TRANSPORT', 'TRANSPORTASI');
    const positionAllowanceIndex = findHeader(detected.headers, 'TUNJ JABATAN', 'TUNJANGAN JABATAN');
    const overtimeIndex = findHeader(detected.headers, 'LEMBUR', 'OVERTIME');
    const thrIndex = findHeader(detected.headers, 'THR');
    const taxAllowanceIndex = findHeader(detected.headers, 'TUNJ PPH 21', 'TUNJANGAN PPH 21');
    const totalIncomeIndex = findHeader(detected.headers, 'TOTAL PENDAPATAN DITERIMA', 'TOTAL INCOME RECEIVED');
    const bpjsWageIndex = findHeader(detected.headers, 'UPAH BPJS PREMI DIDAFTARKAN', 'UPAH BPJS');
    const jhtIndex = findHeader(detected.headers, 'PREMI JHT');
    const jkmIndex = findHeader(detected.headers, 'PREMI JKM');
    const jkkIndex = findHeader(detected.headers, 'PREMI JKK');
    const jpIndex = findHeader(detected.headers, 'PREMI JP');
    const bpjsEmployerTotalIndex = findHeader(detected.headers, 'TOTAL BPJS TK PERUSAHAAN');
    const bpjsHealthEmployerIndex = findHeader(detected.headers, 'BPJS KESEHATAN PERUSAHAAN');
    const employerBenefitsIndex = findHeader(detected.headers, 'TOTAL PENDAPATAN TIDAK DITERIMA', 'TOTAL BENEFIT PERUSAHAAN');
    const grossIndex = findHeader(detected.headers, 'GAJI BRUTO', 'PENDAPATAN BRUTO', 'SALARY GROSS');
    const deductionBpjsTkEmployerIndex = findHeader(detected.headers, 'POT BPJS TK PERUSAHAAN');
    const deductionBpjsHealthEmployerIndex = findHeader(detected.headers, 'POT BPJS KES PERUSAHAAN');
    const deductionBpjsTkEmployeeIndex = findHeader(detected.headers, 'POT BPJS TK KARYAWAN');
    const deductionBpjsHealthEmployeeIndex = findHeader(detected.headers, 'POT BPJS KES KARYAWAN');
    const deductionPph21Index = findHeader(detected.headers, 'POT PPH 21 DITANGGUNG');
    const deductionLoanIndex = findHeader(detected.headers, 'POT KARYAWAN LOAN', 'POTONGAN KARYAWAN LOAN');
    const deductionAbsenceIndex = findHeader(detected.headers, 'POT TIDAK HADIR TELAT', 'POTONGAN TIDAK HADIR TELAT');
    const deductionThrIndex = findHeader(detected.headers, 'POT THR');
    const deductionsIndex = findHeader(detected.headers, 'TOTAL POTONGAN', 'JUMLAH PENGURANGAN', 'DEDUCT');
    const thpIndex = findHeader(detected.headers, 'TAKE HOME PAY');
    const terbilangIndex = findHeader(detected.headers, 'TERBILANG');
    const slipNumberIndex = findHeader(detected.headers, 'SLIP NO', 'SLIP NUMBER');
    const periodIndex = findHeader(detected.headers, 'PERIODE', 'PERIOD');
    const presentIndex = findHeader(detected.headers, 'MASUK', 'PRESENT');
    const sickIndex = findHeader(detected.headers, 'SAKIT', 'SICK');
    const leaveIndex = findHeader(detected.headers, 'IZIN', 'LEAVE');
    const annualLeaveIndex = findHeader(detected.headers, 'CUTI', 'ANNUAL LEAVE');
    const absentIndex = findHeader(detected.headers, 'ALFA', 'ABSENT');
    const offIndex = findHeader(detected.headers, 'OFF', 'LIBUR');
    return rows.slice(detected.rowIndex + 1).map((row): PayrollPreviewRow | null => {
      const employeeNumber = String(cellValue(row, employeeNumberIndex) || '').trim();
      const name = String(cellValue(row, nameIndex) || '').trim();
      if (!employeeNumber || !name) return null;
      const deductions = numberValue(cellValue(row, deductionsIndex));
      const takeHomePay = numberValue(cellValue(row, thpIndex));
      const errors: string[] = [];
      return {
        rowNumber: numberValue(cellValue(row, rowNumberIndex)),
        employeeNumber,
        name,
        branch: textValue(cellValue(row, branchIndex)),
        position: String(cellValue(row, positionIndex) || '').trim(),
        dateJoined: dateValue(cellValue(row, joinedIndex)),
        dateOfBirth: dateValue(cellValue(row, birthIndex)),
        bankName: textValue(cellValue(row, bankIndex)),
        bankAccountNumber: textValue(cellValue(row, bankAccountIndex)),
        taxStatus: textValue(cellValue(row, taxStatusIndex)),
        spouseCount: numberValue(cellValue(row, spouseIndex)),
        childrenCount: numberValue(cellValue(row, childrenIndex)),
        basicSalary: numberValue(cellValue(row, basicIndex)),
        meals: numberValue(cellValue(row, mealsIndex)),
        transport: numberValue(cellValue(row, transportIndex)),
        positionAllowance: numberValue(cellValue(row, positionAllowanceIndex)),
        overtime: numberValue(cellValue(row, overtimeIndex)),
        thr: numberValue(cellValue(row, thrIndex)),
        taxAllowance: numberValue(cellValue(row, taxAllowanceIndex)),
        totalIncomeReceived: numberValue(cellValue(row, totalIncomeIndex)),
        bpjsWage: numberValue(cellValue(row, bpjsWageIndex)),
        jhtEmployer: numberValue(cellValue(row, jhtIndex)),
        jkmEmployer: numberValue(cellValue(row, jkmIndex)),
        jkkEmployer: numberValue(cellValue(row, jkkIndex)),
        jpEmployer: numberValue(cellValue(row, jpIndex)),
        bpjsEmployerTotal: numberValue(cellValue(row, bpjsEmployerTotalIndex)),
        bpjsHealthEmployer: numberValue(cellValue(row, bpjsHealthEmployerIndex)),
        employerBenefitsTotal: numberValue(cellValue(row, employerBenefitsIndex)),
        grossIncome: numberValue(cellValue(row, grossIndex)),
        deductionBpjsTkEmployer: numberValue(cellValue(row, deductionBpjsTkEmployerIndex)),
        deductionBpjsHealthEmployer: numberValue(cellValue(row, deductionBpjsHealthEmployerIndex)),
        deductionBpjsTkEmployee: numberValue(cellValue(row, deductionBpjsTkEmployeeIndex)),
        deductionBpjsHealthEmployee: numberValue(cellValue(row, deductionBpjsHealthEmployeeIndex)),
        deductionPph21: numberValue(cellValue(row, deductionPph21Index)),
        deductionLoan: numberValue(cellValue(row, deductionLoanIndex)),
        deductionAbsence: numberValue(cellValue(row, deductionAbsenceIndex)),
        deductionThr: numberValue(cellValue(row, deductionThrIndex)),
        deductions,
        takeHomePay,
        terbilang: textValue(cellValue(row, terbilangIndex)),
        slipNumber: textValue(cellValue(row, slipNumberIndex)),
        periodLabel: textValue(cellValue(row, periodIndex)),
        attendancePresent: numberValue(cellValue(row, presentIndex)),
        attendanceSick: numberValue(cellValue(row, sickIndex)),
        attendanceLeave: numberValue(cellValue(row, leaveIndex)),
        attendanceAnnualLeave: numberValue(cellValue(row, annualLeaveIndex)),
        attendanceAbsent: numberValue(cellValue(row, absentIndex)),
        attendanceOff: numberValue(cellValue(row, offIndex)),
        errors,
      };
    }).filter((row): row is PayrollPreviewRow => Boolean(row));
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      setPreview(await readWorkbook(file));
    } catch (error) {
      setPreview([]);
      setMessage(error instanceof Error ? error.message : 'Workbook payroll gagal dibaca.');
    } finally {
      setLoading(false);
    }
  };

  const saveBatch = async (status: 'DRAFT' | 'FINAL') => {
    if (!preview.length) return;
    if (preview.some((row) => row.errors.length)) {
      setMessage('Perbaiki baris yang masih memiliki error sebelum menyimpan.');
      return;
    }
    setLoading(true);
    try {
      const result = await savePayrollBatch({ period, fileName, status, rows: preview.map(({ errors: _errors, ...row }) => row) });
      setMessage(`Payroll periode ${period} berhasil disimpan sebagai ${status === 'FINAL' ? 'final' : 'draft'}.`);
      setBatches((current) => [result, ...current.filter((batch) => batch.id !== result.id)]);
      setPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payroll gagal disimpan.');
    } finally {
      setLoading(false);
    }
  };

  const deleteBatch = async (batch: PayrollBatch) => {
    const confirmation = window.prompt(
      `Penghapusan permanen akan menghapus payroll ${batch.period}, ${batch.slipCount} slip pekerja, dan akses PDF periode tersebut.\n\nKetik periode ${batch.period} untuk melanjutkan:`,
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== batch.period) {
      setMessage('Penghapusan dibatalkan karena konfirmasi periode tidak cocok.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const result = await deletePayrollPeriod(batch.period, confirmation.trim());
      setBatches((current) => current.filter((item) => item.id !== batch.id));
      setMessage(`Payroll ${batch.period} dan ${result.deletedSlipCount} slip berhasil dihapus. Periode dapat diunggah ulang.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Payroll periode ${batch.period} gagal dihapus.`);
    } finally {
      setLoading(false);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Payroll / Slip Gaji</h1>
        <p className="mt-1 text-sm text-slate-600">Unggah rekap gaji Excel. Kolom Indonesia untuk identitas, pendapatan, BPJS, potongan, presensi, dan nomor slip akan disimpan ke database dan digunakan pada slip PDF pekerja.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
          <label className="text-sm font-medium text-slate-700">Periode gaji (acuan penyimpanan)<input type="month" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
          <label className="text-sm font-medium text-slate-700">Workbook Excel<input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={handleFile} /></label>
        </div>
        {fileName && <p className="mt-2 text-xs text-slate-500">File: {fileName}</p>}
        {message && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>}
      </section>

      {preview.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">Preview {preview.length} pekerja</h2>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={loading} onClick={() => void saveBatch('DRAFT')}>Simpan draft</button>
            <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={loading} onClick={() => void saveBatch('FINAL')}>Finalisasi</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Nomor pekerja</th><th className="p-2">Nama</th><th className="p-2">Jabatan</th><th className="p-2">Gaji pokok</th><th className="p-2">Gaji bruto</th><th className="p-2">Pengurangan</th><th className="p-2">Take home pay</th><th className="p-2">Status</th></tr></thead>
            <tbody>{preview.map((row) => <tr key={row.employeeNumber} className="border-b border-slate-100"><td className="p-2">{row.employeeNumber}</td><td className="p-2 font-medium">{row.name}</td><td className="p-2">{row.position}</td><td className="p-2">{currency(row.basicSalary)}</td><td className="p-2">{currency(row.grossIncome)}</td><td className="p-2">{currency(row.deductions)}</td><td className="p-2 font-semibold">{currency(row.takeHomePay)}</td><td className="p-2 text-xs">{row.errors.length ? row.errors.join(', ') : 'Siap'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Riwayat payroll</h2>
        {!batches.length && <p className="mt-3 text-sm text-slate-500">Belum ada batch payroll tersimpan.</p>}
        {!!batches.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Periode</th><th className="p-2">File</th><th className="p-2">Status</th><th className="p-2">Jumlah</th><th className="p-2">Aksi</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id} className="border-b border-slate-100"><td className="p-2">{batch.period}</td><td className="p-2">{batch.fileName}</td><td className="p-2">{batch.status}</td><td className="p-2">{batch.slipCount}</td><td className="p-2"><button type="button" className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={loading} onClick={() => void deleteBatch(batch)}>Hapus &amp; unggah ulang</button></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
};
