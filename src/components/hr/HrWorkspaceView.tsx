import React, { useCallback, useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Download, Pencil } from 'lucide-react';
import { AuthAccount } from '../../auth';
import {
  hrApi,
  listWorkerPayrollSlips,
  HrAttendance,
  HrAttendanceEvent,
  HrAttendanceReportRow,
  HrDocument,
  HrEmployee,
  HrEmployeeSave,
  HrHistoryEntry,
  HrLeaveRequest,
  HrProfileChangeRequest,
  HrWorkspace,
  WorkerPayrollSlip,
} from '../../lib/api';
import { formatDateDisplay, formatDateTimeWib, todayISO } from '../../utils/date';
import { getPublicDirectorSignatureUrl, getPublicLogoUrl, getPublicPayrollSignatureUrl } from '../../utils/logo';
import { androidNative, isAndroidApp } from '../../lib/androidNative';

type HrPanel = 'employees' | 'requests' | 'leave-approval' | 'attendance' | 'documents' | 'history' | 'worker-profile' | 'worker-attendance' | 'worker-leave' | 'worker-download-payslip' | 'worker-download-attendance';

const emptyEmployeeForm: HrEmployeeSave = {
  userId: '',
  employeeNumber: '',
  name: '',
  email: '',
  phone: '',
  position: '',
  department: '',
  branchId: '',
  dateOfBirth: '',
  birthCity: '',
  gender: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  employmentStatus: 'ACTIVE',
  religion: '',
  contractType: '',
  contractStart: '',
  contractEnd: '',
  contractDurationYears: '',
  nik: '',
  npwp: '',
  bpjsKetenagakerjaan: '',
  bpjsKesehatan: '',
  payrollAccountNumber: '',
  payrollBankName: '',
};

const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const calculateRequestDuration = (type: HrLeaveRequest['type'], startDate: string, endDate: string) => {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let days = 0;
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (['ANNUAL', 'PERSONAL', 'OTHER'].includes(type) && (date.getDay() === 0 || date.getDay() === 6)) continue;
    days += 1;
  }
  return days;
};

const employeeFormFrom = (employee: HrEmployee): HrEmployeeSave => ({
  userId: employee.userId,
  employeeNumber: employee.employeeNumber || '',
  name: employee.name || '',
  email: employee.email || '',
  phone: employee.phone || '',
  position: employee.position || '',
  department: employee.department || '',
  branchId: employee.branchId ? String(employee.branchId) : '',
  dateOfBirth: employee.dateOfBirth || '',
  birthCity: employee.birthCity || '',
  gender: employee.gender || '',
  address: employee.address || '',
  emergencyContactName: employee.emergencyContactName || '',
  emergencyContactPhone: employee.emergencyContactPhone || '',
  photoDataBase64: employee.photoDataBase64 || undefined,
  photoMimeType: employee.photoMimeType || undefined,
  employmentStatus: employee.employmentStatus || 'ACTIVE',
  religion: employee.religion || '',
  contractType: employee.contractType || '',
  contractStart: employee.contractStart || '',
  contractEnd: employee.contractEnd || '',
  contractDurationYears: employee.contractDurationYears === null ? '' : String(employee.contractDurationYears),
  nik: employee.nik || '',
  npwp: employee.npwp || '',
  bpjsKetenagakerjaan: employee.bpjsKetenagakerjaan || '',
  bpjsKesehatan: employee.bpjsKesehatan || '',
  payrollAccountNumber: employee.payrollAccountNumber || '',
  payrollBankName: employee.payrollBankName || '',
});

const formatEmploymentTenure = (contractStart: string | null | undefined, reportDate = todayISO()): string => {
  if (!contractStart) return '—';
  const parseDate = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
      || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  };
  const startDate = parseDate(contractStart);
  const endDate = parseDate(reportDate);
  if (!startDate || !endDate) return '—';
  if (startDate > endDate) return 'Belum mulai';

  const addMonthsClamped = (date: Date, months: number) => {
    const monthIndex = date.getMonth() + months;
    const year = date.getFullYear() + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
    return new Date(year, month, day);
  };
  let totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
  let monthAnchor = addMonthsClamped(startDate, totalMonths);
  if (monthAnchor > endDate) {
    totalMonths -= 1;
    monthAnchor = addMonthsClamped(startDate, totalMonths);
  }
  const days = Math.round((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    - Date.UTC(monthAnchor.getFullYear(), monthAnchor.getMonth(), monthAnchor.getDate())) / 86400000);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return [`${years} Tahun`, months ? `${months} Bulan` : '', days ? `${days} hari` : '']
    .filter(Boolean)
    .join(' ') || '0 hari';
};

const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const buttonClass = 'rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

interface Props {
  currentUser: AuthAccount;
  initialPanel: HrPanel;
}

export const HrWorkspaceView: React.FC<Props> = ({ currentUser, initialPanel }) => {
  const isHr = currentUser.role === 'HR_ADMINISTRASI';
  const [workspace, setWorkspace] = useState<HrWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<HrPanel>(initialPanel);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [employeeForm, setEmployeeForm] = useState<HrEmployeeSave>(emptyEmployeeForm);
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [employeePhotoPreview, setEmployeePhotoPreview] = useState<string>('');
  const [attendanceForm, setAttendanceForm] = useState({
    date: todayISO(),
    status: 'PRESENT' as HrAttendance['status'],
    checkIn: '',
    checkOut: '',
    note: '',
  });
  const [leaveForm, setLeaveForm] = useState({
    type: 'ANNUAL' as HrLeaveRequest['type'],
    startDate: '',
    endDate: '',
    destinationCity: '',
    transportMode: '' as NonNullable<HrLeaveRequest['transportMode']> | '',
    reason: '',
  });
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState('');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [selectedLeaveRequestId, setSelectedLeaveRequestId] = useState<string | null>(null);
  const [leaveRequestMonth, setLeaveRequestMonth] = useState('');
  const [workerDownloadFilters, setWorkerDownloadFilters] = useState({
    year: Number(todayISO().slice(0, 4)),
    month: Number(todayISO().slice(5, 7)),
  });
  const [workerAttendanceShown, setWorkerAttendanceShown] = useState(false);
  const [workerPayslipShown, setWorkerPayslipShown] = useState(false);
  const [workerPayrollSlips, setWorkerPayrollSlips] = useState<WorkerPayrollSlip[]>([]);
  const [workerPayrollLoading, setWorkerPayrollLoading] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    year: Number(todayISO().slice(0, 4)),
    month: Number(todayISO().slice(5, 7)),
    category: 'ALL' as 'ALL' | 'BRANCH' | 'EMPLOYEE',
    branchId: '',
    name: '',
    filterMode: 'TODAY' as 'TODAY' | 'CUSTOM_DATE' | 'MONTH' | 'YEAR',
    date: todayISO(),
  });
  const [reportRows, setReportRows] = useState<HrAttendanceReportRow[] | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [punchLoading, setPunchLoading] = useState(false);
  const [selectedPunchEvent, setSelectedPunchEvent] = useState<HrAttendanceEvent>('CHECK_IN');
  const [attendanceSuccess, setAttendanceSuccess] = useState<{ title: string; message: string } | null>(null);
  const [attendanceEditRow, setAttendanceEditRow] = useState<HrAttendanceReportRow | null>(null);
  const [attendanceEditDraft, setAttendanceEditDraft] = useState({
    checkIn: '',
    overtimeCheckIn: '',
    checkOut: '',
    overtimeCheckOut: '',
  });

  const reload = useCallback(async (showLoading = false): Promise<boolean> => {
    if (showLoading) setLoading(true);
    try {
      const result = await hrApi.loadWorkspace();
      setWorkspace(result);
      setError('');
      setSelectedUserId((existing) => {
        if (existing && result.employees?.some((employee) => employee.userId === existing)) return existing;
        return result.employees?.[0]?.userId || '';
      });
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Workspace HR gagal dimuat.');
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(true);
  }, [reload]);

  useEffect(() => {
    setPanel(initialPanel);
  }, [initialPanel]);
  const employees = workspace?.employees || [];
  const leaveRequests = workspace?.leaveRequests || [];
  const filteredLeaveRequests = leaveRequestMonth
    ? leaveRequests.filter((request) => request.createdAt.slice(0, 7) === leaveRequestMonth)
    : leaveRequests;
  const selectedLeaveRequest = leaveRequests.find((request) => request.id === selectedLeaveRequestId) || null;
  const selectedEmployee = employees.find((employee) => employee.userId === selectedUserId);
  const branches = workspace?.branches || [];
  const pendingProfiles = (workspace?.profileRequests || []).filter((request) => request.status === 'PENDING').length;
  const tabItems: Array<{ id: HrPanel; label: string }> = [
    { id: 'employees', label: 'Data Pekerja' },
    { id: 'requests', label: `Persetujuan${pendingProfiles ? ` (${pendingProfiles})` : ''}` },
    { id: 'documents', label: 'Dokumen' },
    { id: 'history', label: 'Riwayat' },
  ];

  useEffect(() => {
    if (selectedEmployee) setEmployeeForm(employeeFormFrom(selectedEmployee));
    else setEmployeeForm({ ...emptyEmployeeForm, userId: selectedUserId });
    setEmployeePhotoPreview(selectedEmployee?.photoDataBase64 && selectedEmployee.photoMimeType
      ? `data:${selectedEmployee.photoMimeType};base64,${selectedEmployee.photoDataBase64}`
      : '');
  }, [selectedEmployee, selectedUserId]);

  const selectEmployeePhoto = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Foto pekerja harus berformat JPG atau PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran foto pekerja maksimum 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',', 2)[1] : '';
      setEmployeePhotoPreview(dataUrl);
      setEmployeeForm((form) => ({ ...form, photoDataBase64: base64, photoMimeType: file.type }));
      setError('');
    };
    reader.onerror = () => setError('Foto pekerja gagal dibaca.');
    reader.readAsDataURL(file);
  };

  const editEmployee = (employee: HrEmployee) => {
    setSelectedUserId(employee.userId);
    setEmployeeForm(employeeFormFrom(employee));
    setEmployeePhotoPreview(employee.photoDataBase64 && employee.photoMimeType
      ? `data:${employee.photoMimeType};base64,${employee.photoDataBase64}`
      : '');
    setEmployeeFormOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('employee-administration-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const addEmployeeRecord = () => {
    const employee = employees.find((item) => !item.hasRecord);
    if (!employee) {
      setError('Akun pekerja baru perlu dibuat Admin di menu Users terlebih dahulu.');
      return;
    }
    setSelectedUserId(employee.userId);
    setEmployeeForm(employeeFormFrom(employee));
    setEmployeePhotoPreview(employee.photoDataBase64 && employee.photoMimeType
      ? `data:${employee.photoMimeType};base64,${employee.photoDataBase64}`
      : '');
    setEmployeeFormOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('employee-administration-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const runMutation = async (operation: () => Promise<void>, successMessage: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await operation();
      if (await reload()) setNotice(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Perubahan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async (document: HrDocument) => {
    setError('');
    try {
      const file = await hrApi.downloadDocument(document.id);
      const binary = atob(file.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Dokumen gagal diunduh.');
    }
  };

  const showWorkerPayroll = async () => {
    setWorkerPayrollLoading(true);
    setWorkerPayslipShown(true);
    setError('');
    try {
      const period = `${workerDownloadFilters.year}-${String(workerDownloadFilters.month).padStart(2, '0')}`;
      setWorkerPayrollSlips(await listWorkerPayrollSlips(period));
    } catch (loadError) {
      setWorkerPayrollSlips([]);
      setError(loadError instanceof Error ? loadError.message : 'Slip gaji gagal dimuat.');
    } finally {
      setWorkerPayrollLoading(false);
    }
  };

  const downloadWorkerPayrollPdf = async (slip: WorkerPayrollSlip) => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const directorApprovalSlip = slip.employeeNumber === 'LGM-202512003';
    const currency = (value: number) => value === 0
      ? '-'
      : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
    const number = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
    const logoDataUrl = await imageUrlToDataUrl(getPublicLogoUrl());
    const signatureUrl = directorApprovalSlip ? getPublicDirectorSignatureUrl() : getPublicPayrollSignatureUrl();
    const signatureDataUrl = await imageUrlToDataUrl(signatureUrl);
    if (!logoDataUrl || !signatureDataUrl) throw new Error('Logo atau tanda tangan penanggung jawab gagal dimuat untuk PDF.');
    const formatDate = (value: string) => {
      if (!value) return '-';
      const date = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : new Date();
      return Number.isNaN(date.getTime())
        ? '-'
        : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    };
    const periodDate = new Date(`${slip.period}-01T00:00:00`);
    const periodLabel = Number.isNaN(periodDate.getTime())
      ? slip.period
      : new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(periodDate);
    const payrollIssueDate = /^\d{4}-\d{2}$/.test(slip.period) ? `${slip.period}-27` : todayISO();
    const signerRole = directorApprovalSlip ? 'Direktur' : 'Finance';
    const signerName = directorApprovalSlip ? 'Lailun Nifal Fahmi' : 'Diva Fitri Mellanie';
    const uploadedPeriodLabel = slip.periodLabel.trim();
    const periodYear = slip.period.match(/\d{4}/)?.[0] || '';
    const payslipPeriod = uploadedPeriodLabel
      ? /\b\d{4}\b/.test(uploadedPeriodLabel) ? uploadedPeriodLabel : `${uploadedPeriodLabel} ${periodYear}`.trim()
      : periodLabel;
    const navy = [31, 56, 100] as const;
    const line = [191, 197, 210] as const;
    const soft = [238, 242, 248] as const;
    const green = [226, 239, 218] as const;
    const ink = [27, 27, 27] as const;
    const muted = [95, 107, 122] as const;
    const fill = (color: readonly [number, number, number]) => pdf.setFillColor(...color);
    const textColor = (color: readonly [number, number, number]) => pdf.setTextColor(...color);
    const drawSectionTitle = (x: number, y: number, width: number, title: string) => {
      fill(navy);
      pdf.rect(x, y, width, 7, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      textColor([255, 255, 255]);
      pdf.text(title, x + 3, y + 4.8);
    };
    const drawAmountRow = (x: number, y: number, width: number, height: number, label: string, value: number, total = false) => {
      if (total) {
        fill(soft);
        pdf.rect(x, y, width, height, 'F');
      }
      pdf.setDrawColor(...line);
      pdf.setLineWidth(0.15);
      pdf.rect(x, y, width, height);
      pdf.setFont('helvetica', total ? 'bold' : 'normal');
      pdf.setFontSize(7);
      textColor(ink);
      pdf.text(label, x + 3, y + height * 0.68, { maxWidth: width - 29 });
      pdf.setFont('helvetica', total || value !== 0 ? 'bold' : 'normal');
      pdf.text('Rp', x + width - 20, y + height * 0.68, { align: 'right' });
      pdf.text(total ? number(value) : currency(value), x + width - 3, y + height * 0.68, { align: 'right' });
    };

    fill([255, 255, 255]);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.addImage(logoDataUrl, 'JPEG', 14, 5, 17, 14);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    textColor(navy);
    pdf.text('PT LENTERA GLOBAL MARITIM', 37, 10.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    textColor(muted);
    pdf.text('Head Office - Tebet, Jakarta', 37, 15);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    textColor(navy);
    pdf.text('S A L A R Y   S L I P', 197, 18, { align: 'right' });
    pdf.setDrawColor(...navy);
    pdf.setLineWidth(0.8);
    pdf.line(13, 25, 197, 25);

    const drawIdentity = (x: number, y: number, label: string, value: string, labelWidth: number, valueWidth = 48) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      textColor(muted);
      pdf.text(label, x, y);
      pdf.text(':', x + labelWidth, y);
      pdf.setFont('helvetica', 'bold');
      textColor(ink);
      pdf.text(value || '-', x + labelWidth + 2.5, y, { maxWidth: valueWidth });
    };
    drawIdentity(13, 33, 'ID - Nama', `${slip.employeeNumber} - ${slip.employeeName}`, 29, 62);
    drawIdentity(13, 40, 'Periode', payslipPeriod, 29);
    drawIdentity(13, 47, 'Cabang', slip.branch, 29);
    drawIdentity(111, 33, 'Tgl Masuk', formatDate(slip.dateJoined), 29);
    drawIdentity(111, 40, 'Slip No', slip.slipNumber || slip.employeeNumber, 29);
    drawIdentity(111, 47, 'Tgl Terbit', formatDate(payrollIssueDate), 29);
    drawIdentity(111, 54, 'Jabatan', slip.position, 29);

    drawSectionTitle(13, 63, 184, 'PRESENSI');
    const attendance = [
      ['Masuk', slip.attendancePresent],
      ['Sakit', slip.attendanceSick],
      ['Izin', slip.attendanceLeave],
      ['Cuti', slip.attendanceAnnualLeave],
      ['Alfa', slip.attendanceAbsent],
      ['Off', slip.attendanceOff],
    ] as Array<[string, number]>;
    const attendanceY = 70;
    const attendanceWidth = 184 / attendance.length;
    pdf.setLineWidth(0.15);
    attendance.forEach(([label, value], index) => {
      const x = 13 + index * attendanceWidth;
      pdf.setDrawColor(...line);
      pdf.rect(x, attendanceY, attendanceWidth, 12);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      textColor(muted);
      pdf.text(label, x + attendanceWidth / 2, attendanceY + 4.5, { align: 'center' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      textColor(ink);
      pdf.text(value === 0 ? '-' : number(value), x + attendanceWidth / 2, attendanceY + 9.5, { align: 'center' });
    });

    const tableY = 87;
    const tableWidth = 90;
    const leftX = 13;
    const rightX = 107;
    drawSectionTitle(leftX, tableY, tableWidth, 'PENDAPATAN');
    drawSectionTitle(rightX, tableY, tableWidth, 'POTONGAN');
    const incomeRows: Array<[string, number]> = [
      ['Gaji Pokok', slip.basicSalary],
      ['THR', slip.thr],
      ['Tunjangan Jabatan', slip.positionAllowance],
      ['Tunjangan Transport', slip.transport],
      ['Tunjangan Makan', slip.meals],
      ['Lembur', slip.overtime],
      ['Tunjangan PPh 21', slip.taxAllowance],
    ];
    const deductionRows: Array<[string, number]> = [
      ['Premi BPJS TK dibayar Perusahaan', slip.deductionBpjsTkEmployer],
      ['Premi BPJS Kes. dibayar Perusahaan', slip.deductionBpjsHealthEmployer],
      ['Premi BPJS TK Karyawan', slip.deductionBpjsTkEmployee],
      ['Premi BPJS Kes. Karyawan', slip.deductionBpjsHealthEmployee],
      ['PPh 21 Ditanggung Karyawan', slip.deductionPph21],
      ['Potongan Karyawan', slip.deductionLoan],
      ['Potongan Tidak Hadir / Telat', slip.deductionAbsence],
      ['Potongan THR', slip.deductionThr],
    ];
    const amountRowHeight = 4.5;
    incomeRows.forEach(([label, value], index) => drawAmountRow(leftX, tableY + 7 + index * amountRowHeight, tableWidth, amountRowHeight, label, value));
    drawAmountRow(leftX, tableY + 7 + incomeRows.length * amountRowHeight, tableWidth, 5, 'Total Pendapatan', slip.totalIncomeReceived, true);
    deductionRows.forEach(([label, value], index) => drawAmountRow(rightX, tableY + 7 + index * amountRowHeight, tableWidth, amountRowHeight, label, value));
    drawAmountRow(rightX, tableY + 7 + deductionRows.length * amountRowHeight, tableWidth, 5, 'Total Potongan', slip.deductions, true);

    const benefitsY = 140;
    drawSectionTitle(13, benefitsY, 184, 'PENDAPATAN YANG TIDAK DITERIMA KARYAWAN');
    const benefits: Array<[string, number]> = [
      ['Premi JHT dibayar Perusahaan', slip.jhtEmployer],
      ['Premi JKK dibayar Perusahaan', slip.jkkEmployer],
      ['Premi JKM dibayar Perusahaan', slip.jkmEmployer],
      ['Premi JP dibayar Perusahaan', slip.jpEmployer],
      ['Premi BPJS Kesehatan dibayar Perusahaan', slip.bpjsHealthEmployer],
      ['Total', slip.employerBenefitsTotal],
    ];
    benefits.forEach(([label, value], index) => drawAmountRow(13, benefitsY + 7 + index * 4.8, 184, 4.8, label, value, index === benefits.length - 1));

    fill(green);
    pdf.setDrawColor(...navy);
    pdf.rect(13, 184, 184, 15, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    textColor(navy);
    pdf.text('TAKE HOME PAY', 18, 193.5);
    pdf.setFontSize(15);
    textColor(ink);
    pdf.text(`Rp ${number(slip.takeHomePay)}`, 192, 194, { align: 'right' });

    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    textColor(muted);
    pdf.text('Terbilang:', 13, 205);
    pdf.setFont('helvetica', 'bolditalic');
    textColor(ink);
    pdf.text(slip.terbilang || `${number(slip.takeHomePay)} Rupiah`, 34, 205, { maxWidth: 160 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    textColor(muted);
    pdf.text('Gaji ditransfer ke rekening:', 13, 214);
    pdf.text(`${slip.bankName || '-'}  |  No. Rekening ${slip.bankAccountNumber || '-'}  |  a.n. ${slip.employeeName}`, 13, 219, { maxWidth: 184 });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    textColor(ink);
    pdf.text('Penerima,', 57, 239, { align: 'center' });
    pdf.text(`Jakarta, ${formatDate(payrollIssueDate)}`, 158, 235, { align: 'center' });
    pdf.text(`${signerRole},`, 158, 240, { align: 'center' });
    pdf.addImage(signatureDataUrl, 'JPEG', 140, 242, 36, 22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(slip.employeeName, 57, 269, { align: 'center', maxWidth: 75 });
    pdf.text(signerName, 158, 269, { align: 'center' });
    pdf.setDrawColor(...line);
    pdf.line(13, 278, 197, 278);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    textColor(muted);
    pdf.text(`Dokumen ini dibuat otomatis dan bersifat rahasia | Tanggal cetak dokumen: ${formatDate(todayISO())}`, 13, 282);
    pdf.text(slip.slipNumber || slip.employeeNumber, 197, 282, { align: 'right' });
    const fileName = `Slip-Gaji-${slip.period}-${slip.employeeNumber}.pdf`;
    if (isAndroidApp()) {
      const contentBase64 = pdf.output('datauristring').split(',', 2)[1];
      if (!contentBase64) throw new Error('Isi PDF slip gaji gagal dibuat.');
      await androidNative.downloadBase64(fileName, 'application/pdf', contentBase64);
    } else {
      pdf.save(fileName);
    }
  };

  const saveEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    const form = event.currentTarget;
    let firstInvalidField: HTMLInputElement | HTMLSelectElement | null = null;
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input[required], select[required], textarea[required]').forEach((field) => {
      field.setCustomValidity(field.value.trim() ? '' : 'Kolom ini wajib diisi.');
      if (!firstInvalidField && !field.checkValidity()) firstInvalidField = field;
    });
    if (firstInvalidField) {
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalidField.focus();
      firstInvalidField.reportValidity();
      return;
    }
    void runMutation(() => hrApi.saveEmployee(employeeForm), 'Data pekerja berhasil disimpan.');
  };

  const downloadEmployeeExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Informasi Data Pekerja');
      sheet.columns = [
        { header: 'NO. PEKERJA', key: 'employeeNumber', width: 20 },
        { header: 'NAMA', key: 'name', width: 30 },
        { header: 'JABATAN', key: 'position', width: 26 },
        { header: 'BRANCH', key: 'branch', width: 20 },
        { header: 'KONTRAK', key: 'contract', width: 18 },
        { header: 'MULAI', key: 'contractStart', width: 16 },
        { header: 'BERAKHIR', key: 'contractEnd', width: 16 },
        { header: 'BPJS TENAGA KERJA', key: 'bpjsKetenagakerjaan', width: 24 },
        { header: 'BPJS KESEHATAN', key: 'bpjsKesehatan', width: 22 },
        { header: 'BANK PAYROLL', key: 'payrollBankName', width: 22 },
        { header: 'USIA BEKERJA', key: 'employmentTenure', width: 24 },
        { header: 'STATUS KERJA', key: 'status', width: 18 },
        { header: 'AGAMA', key: 'religion', width: 22 },
      ];
      employees.forEach((employee) => sheet.addRow({
        employeeNumber: employee.employeeNumber || '',
        name: employee.name,
        position: employee.position || '',
        branch: employee.branchName || '',
        contract: ({
          PERMANENT: 'Tetap',
          CONTRACT: 'Kontrak',
          PROBATION: 'Probation',
          INTERNSHIP: 'Magang',
          OTHER: 'Lainnya',
        } as Record<string, string>)[employee.contractType || ''] || '',
        contractStart: employee.contractStart || '',
        contractEnd: employee.contractEnd || '',
        bpjsKetenagakerjaan: employee.bpjsKetenagakerjaan || '',
        bpjsKesehatan: employee.bpjsKesehatan || '',
        payrollBankName: employee.payrollBankName || '',
        employmentTenure: formatEmploymentTenure(employee.contractStart),
        religion: employee.religion || '',
        status: employee.employmentStatus === 'ACTIVE'
          ? 'Aktif'
          : employee.employmentStatus === 'ON_LEAVE'
            ? 'Cuti'
            : employee.employmentStatus === 'RESIGNED'
              ? 'Berakhir / resign'
              : 'Belum lengkap',
      }));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'M1' };
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `data-pekerja-${todayISO()}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Data pekerja gagal diekspor ke Excel.');
    }
  };

  const uploadDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('document') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!selectedUserId || !file) {
      setError('Pilih pekerja dan dokumen yang akan diunggah.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran maksimum dokumen adalah 2 MB.');
      return;
    }
    const formData = new FormData(form);
    const title = String(formData.get('title') || '');
    const category = String(formData.get('category') || '');
    void runMutation(async () => {
      await hrApi.uploadDocument({ userId: selectedUserId, title, category, file });
      form.reset();
    }, 'Dokumen pekerja berhasil diunggah.');
  };

  const saveAttendance = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      setError('Pilih pekerja terlebih dahulu.');
      return;
    }
    void runMutation(() => hrApi.saveAttendance({ userId: selectedUserId, ...attendanceForm }), 'Data kehadiran berhasil disimpan.');
  };

  const openAttendanceEdit = (row: HrAttendanceReportRow) => {
    setAttendanceEditRow(row);
    setAttendanceEditDraft({
      checkIn: attendanceInputTime(row.checkInAt),
      overtimeCheckIn: attendanceInputTime(row.overtimeCheckInAt),
      checkOut: attendanceInputTime(row.checkOutAt),
      overtimeCheckOut: attendanceInputTime(row.overtimeCheckOutAt),
    });
  };

  const saveAttendanceEdit = async () => {
    if (!attendanceEditRow) return;
    setReportLoading(true);
    try {
      await hrApi.saveAttendanceEdit({
        userId: attendanceEditRow.userId,
        date: attendanceEditRow.date,
        checkIn: attendanceEditDraft.checkIn,
        overtimeCheckIn: attendanceEditDraft.overtimeCheckIn,
        checkOut: attendanceEditDraft.checkOut,
        overtimeCheckOut: attendanceEditDraft.overtimeCheckOut,
      });
      await submitAttendanceReport({ preventDefault: () => undefined } as React.FormEvent);
      setAttendanceEditRow(null);
      setNotice('Data koreksi absensi berhasil disimpan.');
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Koreksi absensi gagal disimpan.');
    } finally {
      setReportLoading(false);
    }
  };

  const submitAttendanceReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reportFilters.filterMode === 'CUSTOM_DATE' && !reportFilters.date) {
      setError('Pilih tanggal yang ingin ditampilkan.');
      return;
    }
    if (reportFilters.category === 'BRANCH' && !reportFilters.branchId) {
      setError('Pilih branch untuk menampilkan rekap.');
      return;
    }
    if (reportFilters.category === 'EMPLOYEE' && !reportFilters.name.trim()) {
      setError('Masukkan nama pekerja untuk menampilkan rekap.');
      return;
    }
    setReportLoading(true);
    setError('');
    setNotice('');
    try {
      const rows = await hrApi.attendanceReport({
        ...reportFilters,
        name: reportFilters.name.trim(),
        date: reportFilters.filterMode === 'TODAY' ? todayISO() : reportFilters.filterMode === 'CUSTOM_DATE' ? reportFilters.date : undefined,
        filterMode: reportFilters.filterMode,
      });
      const today = todayISO();
      const elapsedRows = rows.filter((row) => row.date <= today);
      setReportRows(elapsedRows);
      setNotice(`${elapsedRows.length} baris data absensi berhasil ditarik.`);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Rekap absensi gagal dimuat.');
    } finally {
      setReportLoading(false);
    }
  };

  const downloadAttendanceReport = async () => {
    if (!reportRows) return;
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Absensi Kehadiran');
      sheet.columns = [
        { header: 'Tanggal Absen', key: 'date', width: 16 },
        { header: 'Nama pekerja', key: 'employeeName', width: 28 },
        { header: 'Nomor pekerja', key: 'employeeNumber', width: 18 },
        { header: 'Jabatan', key: 'position', width: 24 },
        { header: 'Branch', key: 'branchName', width: 18 },
        { header: 'Departemen', key: 'department', width: 24 },
        { header: 'Absen Datang', key: 'checkInAt', width: 22 },
        { header: 'Lokasi Absen Datang', key: 'checkInLocation', width: 30 },
        { header: 'Lembur Datang', key: 'overtimeCheckInAt', width: 22 },
        { header: 'Lokasi Lembur Datang', key: 'overtimeCheckInLocation', width: 30 },
        { header: 'Absen Pulang', key: 'checkOutAt', width: 22 },
        { header: 'Lokasi Absen Pulang', key: 'checkOutLocation', width: 30 },
        { header: 'Lembur Pulang', key: 'overtimeCheckOutAt', width: 22 },
        { header: 'Lokasi Lembur Pulang', key: 'overtimeCheckOutLocation', width: 30 },
        { header: 'Keterangan', key: 'note', width: 34 },
      ];
      reportRows.forEach((row) => sheet.addRow(attendanceExportRow(row)));
      const summarySheet = workbook.addWorksheet('Ringkasan Kehadiran');
      summarySheet.columns = [
        { header: 'Nama Pekerja', key: 'employeeName', width: 28 },
        { header: 'Nomor Pekerja', key: 'employeeNumber', width: 18 },
        { header: 'Jabatan', key: 'position', width: 24 },
        { header: 'Branch', key: 'branchName', width: 18 },
        { header: 'Departemen', key: 'department', width: 24 },
        { header: 'Jumlah Kehadiran', key: 'present', width: 20 },
        { header: 'Sakit', key: 'sick', width: 12 },
        { header: 'Cuti/Izin', key: 'leave', width: 12 },
        { header: 'Tidak Absen', key: 'absent', width: 16 },
      ];
      attendanceSummary(reportRows).forEach((summary) => summarySheet.addRow(summary));
      summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      summarySheet.views = [{ state: 'frozen', ySplit: 1 }];
      summarySheet.autoFilter = { from: 'A1', to: 'I1' };
      const overtimeRows = reportRows.filter((row) => row.overtimeCheckInAt || row.overtimeCheckOutAt);
      const overtimeSheet = workbook.addWorksheet('Data Pekerja Lembur');
      overtimeSheet.columns = [
        { header: 'Tanggal Absen', key: 'date', width: 16 },
        { header: 'Nama Pekerja', key: 'employeeName', width: 28 },
        { header: 'Nomor Pekerja', key: 'employeeNumber', width: 18 },
        { header: 'Jabatan', key: 'position', width: 24 },
        { header: 'Branch', key: 'branchName', width: 18 },
        { header: 'Departemen', key: 'department', width: 24 },
        { header: 'Lembur Datang', key: 'overtimeCheckInAt', width: 22 },
        { header: 'Lokasi Lembur Datang', key: 'overtimeCheckInLocation', width: 30 },
        { header: 'Lembur Pulang', key: 'overtimeCheckOutAt', width: 22 },
        { header: 'Lokasi Lembur Pulang', key: 'overtimeCheckOutLocation', width: 30 },
        { header: 'Durasi Lembur', key: 'duration', width: 18 },
      ];
      overtimeRows.forEach((row) => overtimeSheet.addRow({
        ...attendanceExportRow(row),
        overtimeCheckInLocation: locationExportValue(row.overtimeCheckInLatitude, row.overtimeCheckInLongitude, row.overtimeCheckInAccuracyMeters),
        overtimeCheckOutLocation: locationExportValue(row.overtimeCheckOutLatitude, row.overtimeCheckOutLongitude, row.overtimeCheckOutAccuracyMeters),
        duration: overtimeDuration(row),
      }));
      overtimeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      overtimeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      overtimeSheet.views = [{ state: 'frozen', ySplit: 1 }];
      overtimeSheet.autoFilter = { from: 'A1', to: 'K1' };
      const overtimeSummarySheet = workbook.addWorksheet('Ringkasan Lembur');
      overtimeSummarySheet.columns = [
        { header: 'Nama Pekerja', key: 'employeeName', width: 28 },
        { header: 'Nomor Pekerja', key: 'employeeNumber', width: 18 },
        { header: 'Jabatan', key: 'position', width: 24 },
        { header: 'Branch', key: 'branchName', width: 18 },
        { header: 'Departemen', key: 'department', width: 24 },
        { header: 'Jumlah Hari Lembur', key: 'days', width: 20 },
        { header: 'Jumlah Jam Lembur', key: 'hours', width: 20 },
      ];
      overtimeSummary(overtimeRows).forEach((summary) => overtimeSummarySheet.addRow(summary));
      overtimeSummarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      overtimeSummarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      overtimeSummarySheet.views = [{ state: 'frozen', ySplit: 1 }];
      overtimeSummarySheet.autoFilter = { from: 'A1', to: 'G1' };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'O1' };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      const reportDate = reportFilters.filterMode === 'TODAY'
        ? todayISO()
        : reportFilters.filterMode === 'CUSTOM_DATE'
          ? reportFilters.date
          : reportFilters.filterMode === 'MONTH'
            ? `${reportFilters.year}-${String(reportFilters.month).padStart(2, '0')}`
            : String(reportFilters.year);
      link.download = `absensi-${reportDate || `${reportFilters.year}-${String(reportFilters.month).padStart(2, '0')}`}-${reportFilters.category.toLowerCase()}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'File Excel gagal dibuat.');
    }
  };

  const downloadLeaveRequestsExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Surat Permohonan');
      sheet.columns = [
        { header: 'No', key: 'number', width: 8 },
        { header: 'Tanggal Surat Masuk', key: 'createdAt', width: 22 },
        { header: 'Nama Pekerja', key: 'employeeName', width: 28 },
        { header: 'Nomor Pekerja', key: 'employeeNumber', width: 20 },
        { header: 'Jabatan', key: 'position', width: 24 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Jenis Permohonan', key: 'type', width: 22 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Tanggal Mulai', key: 'startDate', width: 18 },
        { header: 'Tanggal Berakhir', key: 'endDate', width: 18 },
        { header: 'Durasi Hari', key: 'duration', width: 14 },
        { header: 'Kota Tujuan', key: 'destinationCity', width: 22 },
        { header: 'Kendaraan', key: 'transportMode', width: 20 },
        { header: 'Alasan', key: 'reason', width: 40 },
        { header: 'Catatan HR', key: 'reviewNote', width: 36 },
        { header: 'Diputus Oleh', key: 'reviewedBy', width: 24 },
        { header: 'Tanggal Keputusan', key: 'reviewedAt', width: 22 },
      ];
      filteredLeaveRequests.forEach((request, index) => {
        const employee = employees.find((item) => item.userId === request.userId);
        sheet.addRow({
          number: index + 1,
          createdAt: formatDateDisplay(request.createdAt),
          employeeName: request.employeeName || employee?.name || '-',
          employeeNumber: employee?.employeeNumber || '-',
          position: employee?.position || '-',
          branch: employee?.branchName || '-',
          type: leaveTypeLabel(request.type),
          status: leaveStatusLabel(request.status),
          startDate: formatDateDisplay(request.startDate),
          endDate: formatDateDisplay(request.endDate),
          duration: request.durationDays || calculateRequestDuration(request.type, request.startDate, request.endDate),
          destinationCity: request.destinationCity || '-',
          transportMode: request.transportMode ? transportModeLabel(request.transportMode) : '-',
          reason: request.reason,
          reviewNote: request.reviewNote || '-',
          reviewedBy: request.reviewedByName || '-',
          reviewedAt: request.reviewedAt ? formatDateTimeWib(request.reviewedAt) : '-',
        });
      });
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'Q1' };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `surat-permohonan-${leaveRequestMonth || 'semua-bulan'}-${todayISO()}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
      setNotice('Data surat permohonan berhasil diunduh.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'File Excel surat permohonan gagal dibuat.');
    }
  };

  const punchAttendance = async (event: HrAttendanceEvent) => {
    if (!navigator.geolocation) {
      setError('Perangkat/browser ini tidak menyediakan layanan lokasi. Absensi memerlukan lokasi aktif.');
      return;
    }
    setPunchLoading(true);
    setError('');
    setNotice('');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        });
      });
      const result = await hrApi.punchAttendance({
        event,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      if (navigator.vibrate) navigator.vibrate(80);
      if (await reload()) setNotice(`${attendanceEventLabel(result.event)} berhasil dicatat pada ${result.occurredAt}.`);
      const lateCheckIn = event === 'CHECK_IN' && attendanceTimeMinutes(result.occurredAt) > 540;
      const isOperationalHoliday = [0, 6].includes(new Date().getDay());
      const attendanceTime = formatAttendanceTime(result.occurredAt);
      setAttendanceSuccess({
        title: lateCheckIn && !isOperationalHoliday ? 'Anda absen datang telat' : 'Absensi berhasil',
        message: result.event === 'OVERTIME_CHECK_IN'
          ? `Anda sudah melakukan presensi lembur datang jam ${attendanceTime}.`
          : result.event === 'OVERTIME_CHECK_OUT'
            ? `Anda sudah melakukan presensi lembur pulang jam ${attendanceTime}. Selamat beristirahat ya.`
            : event === 'CHECK_IN'
          ? lateCheckIn ? `Anda sudah melakukan presensi Absen datang jam ${attendanceTime}. Mohon gunakan waktu yang tersedia.` : `Anda sudah melakukan presensi Absen datang jam ${attendanceTime}.`
          : event === 'CHECK_OUT'
            ? `Anda sudah melakukan presensi Absen pulang jam ${attendanceTime}. Selamat beristirahat ya.`
            : `Anda sudah melakukan presensi ${attendanceEventLabel(event)} jam ${attendanceTime}.`,
      });
    } catch (punchError) {
      if (punchError instanceof GeolocationPositionError) {
        setError(punchError.code === punchError.PERMISSION_DENIED
          ? 'Izin lokasi belum diberikan. Izinkan akses lokasi untuk portal ini, lalu coba absensi lagi.'
          : punchError.code === punchError.TIMEOUT
            ? 'Lokasi belum berhasil dibaca. Coba lagi di area dengan sinyal GPS lebih baik.'
            : 'Lokasi perangkat gagal dibaca. Pastikan GPS/lokasi aktif.');
      } else {
        setError(punchError instanceof Error ? punchError.message : 'Absensi gagal dikirim.');
      }
    } finally {
      setPunchLoading(false);
    }
  };

  const confirmAttendance = (event: HrAttendanceEvent) => {
    const action = workerAttendanceActions(workspace?.attendance || []).find((item) => item.event === event);
    if (!action) return;

    if (action.completed) {
      const recordedTime = workerAttendanceRecordedTime(workspace?.attendance || [], event);
      setAttendanceSuccess({
        title: 'Presensi sudah tercatat',
        message: `Anda sudah melakukan presensi ${attendanceEventLabel(event)} jam ${recordedTime}.`,
      });
      return;
    }

    void punchAttendance(event);
  };

  const reviewLeave = (request: HrLeaveRequest, decision: 'APPROVED' | 'REJECTED') => {
    const note = decisionNotes[request.id] || '';
    if (decision === 'REJECTED' && !note.trim()) {
      setError('Catatan penolakan surat permohonan wajib diisi.');
      return;
    }
    void runMutation(() => hrApi.reviewLeave({ id: request.id, decision, note }), `Pengajuan ${decision === 'APPROVED' ? 'disetujui' : 'ditolak'}.`);
  };

  const reviewProfile = (request: HrProfileChangeRequest, decision: 'APPROVED' | 'REJECTED') => {
    const note = decisionNotes[request.id] || '';
    if (decision === 'REJECTED' && !note.trim()) {
      setError('Alasan penolakan perubahan profil wajib diisi.');
      return;
    }
    void runMutation(() => hrApi.reviewProfileChange({ id: request.id, decision, note }), `Perubahan profil ${decision === 'APPROVED' ? 'disetujui' : 'ditolak'}.`);
  };

  const profile = workspace?.profile;
  const ownDocuments = workspace?.documents || [];
  const ownAttendance = workspace?.attendance || [];
  const ownLeaveRequests = workspace?.leaveRequests || [];
  const workerDownloadYears = Array.from(new Set([
    Number(todayISO().slice(0, 4)),
    ...ownAttendance.map((row) => Number(row.date.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 0),
    ...ownDocuments.map((document) => Number(String(document.uploadedAt).slice(0, 4))).filter((year) => Number.isInteger(year) && year > 0),
  ])).sort((a, b) => b - a);
  const filteredWorkerAttendance = ownAttendance.filter((row) => {
    const [year, month] = row.date.split('-').map(Number);
    return year === workerDownloadFilters.year && month === workerDownloadFilters.month;
  });
  const workerPayslipDocuments = ownDocuments.filter((document) => {
    const date = String(document.uploadedAt).slice(0, 10);
    const [year, month] = date.split('-').map(Number);
    const searchableText = `${document.category} ${document.title}`.toLocaleLowerCase();
    return year === workerDownloadFilters.year
      && month === workerDownloadFilters.month
      && (searchableText.includes('gaji') || searchableText.includes('payroll') || searchableText.includes('slip'));
  });

  const downloadOwnAttendance = async (rows: HrAttendance[]) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Absensi');
      sheet.columns = [
        { header: 'Tanggal', key: 'date', width: 16 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Absen Datang', key: 'checkIn', width: 20 },
        { header: 'Absen Pulang', key: 'checkOut', width: 20 },
        { header: 'Keterangan', key: 'note', width: 36 },
      ];
      rows.forEach((row) => sheet.addRow({
        date: formatDateDisplay(row.date),
        status: row.status,
        checkIn: formatAttendanceTime(row.checkInAt || row.checkIn),
        checkOut: formatAttendanceTime(row.checkOutAt || row.checkOut),
        note: row.note || '',
      }));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `absensi-${profile?.employeeNumber || currentUser.id}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'File absensi gagal dibuat.');
    }
  };
  useEffect(() => {
    setWorkerPhotoPreview(profile?.photoDataBase64 && profile.photoMimeType
      ? `data:${profile.photoMimeType};base64,${profile.photoDataBase64}`
      : '');
  }, [profile?.photoDataBase64, profile?.photoMimeType]);

  const selectWorkerPhoto = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Foto pekerja harus berformat JPG atau PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran foto pekerja maksimum 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const photoDataBase64 = dataUrl.includes(',') ? dataUrl.split(',', 2)[1] : '';
      setWorkerPhotoPreview(dataUrl);
      void runMutation(async () => {
        await hrApi.updateWorkerPhoto({ photoDataBase64, photoMimeType: file.type });
        await reload();
      }, 'Foto profil berhasil diperbarui.');
    };
    reader.onerror = () => setError('Foto pekerja gagal dibaca.');
    reader.readAsDataURL(file);
  };

  const isAttendancePanel = isHr && panel === 'attendance';
  const isLeaveApprovalPanel = isHr && panel === 'leave-approval';
  const title = isAttendancePanel ? 'Absensi Kehadiran' : isLeaveApprovalPanel ? 'Surat Permohonan Masuk' : isHr ? 'Administrasi Pekerja' : 'Workspace Pekerja';
  const description = isAttendancePanel
    ? 'Informasi dan rekap kehadiran pekerja seluruh cabang.'
    : isLeaveApprovalPanel
    ? 'Tinjau, lihat, dan putuskan surat permohonan dari pekerja.'
    : isHr
    ? 'Kelola data pekerja, dokumen, kontrak, mutasi, dan persetujuan untuk seluruh cabang.'
    : 'Lihat profil, dokumen, kehadiran, dan ajukan cuti atau perubahan data diri.';

  if (loading) {
    return <div className={sectionClass}><p className="text-sm text-slate-600">Memuat workspace administrasi pekerja...</p></div>;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{isHr ? 'HR ADMINISTRASI · SELURUH CABANG' : 'AKUN PEKERJA'}</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      {isHr ? (
        <>
          {isAttendancePanel && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Catatan Kehadiran', workspace?.attendance.length || 0],
                ['Data Ditampilkan', reportRows?.length || 0],
              ].map(([label, value]) => (
                <div key={label} className={sectionClass}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          )}
          {!isAttendancePanel && !isLeaveApprovalPanel && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Akun Pekerja', employees.length],
              ['Menunggu Persetujuan', pendingProfiles],
              ['Dokumen Tersimpan', workspace?.documents.length || 0],
            ].map(([label, value]) => (
              <div key={label} className={sectionClass}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>}
          {!isAttendancePanel && !isLeaveApprovalPanel && (
          <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2" aria-label="Menu HR">
            {tabItems.map((item) => (
              <button key={item.id} type="button" className={panel === item.id ? buttonClass : secondaryButtonClass} onClick={() => setPanel(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          )}

          {panel === 'employees' && (
            <section className={sectionClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Informasi Data Pekerja</h2>
                  <p className="mt-1 text-sm text-slate-600">Ringkasan hasil entri administrasi pekerja dan akses untuk memperbarui data.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} onClick={() => void downloadEmployeeExcel()}>Download Excel</button>
                  <button type="button" className={buttonClass} onClick={addEmployeeRecord}>Tambah pekerja</button>
                </div>
              </div>
              {employeeFormOpen && <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                <h3 className="font-bold text-slate-900">Data administrasi pekerja</h3>
                <button type="button" className={secondaryButtonClass} onClick={() => setEmployeeFormOpen(false)}>Kembali ke daftar</button>
              </div>
              <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.8fr)]">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Pilih pekerja</label>
                  <select className={fieldClass} value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                    <option value="">Pilih akun pekerja</option>
                    {employees.map((employee) => (
                      <option key={employee.userId} value={employee.userId}>
                        {employee.name}{employee.employeeNumber ? ` · ${employee.employeeNumber}` : ' · data belum dilengkapi'}
                      </option>
                    ))}
                  </select>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <div data-employee-photo-frame className="mx-auto flex aspect-[2/3] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-lg border-[3px] border-blue-700 bg-white shadow-[0_8px_22px_rgba(29,78,216,0.22)]">
                      {employeePhotoPreview
                        ? <img src={employeePhotoPreview} alt={`Foto ${selectedEmployee?.name || 'pekerja'}`} className="h-full w-full object-cover" />
                        : <span className="px-4 text-xs text-slate-400">Foto pekerja</span>}
                    </div>
                    <label className={`${secondaryButtonClass} mt-3 inline-block cursor-pointer`}>
                      Upload photo
                      <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={(event) => selectEmployeePhoto(event.target.files?.[0])} />
                    </label>
                  </div>
                  <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto">
                    {employees.map((employee) => (
                      <button key={employee.userId} type="button" onClick={() => setSelectedUserId(employee.userId)}
                        className={`w-full rounded-xl border p-3 text-left ${selectedUserId === employee.userId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <span className="block font-semibold text-slate-800">{employee.name}</span>
                        <span className="mt-1 block text-xs text-slate-500">{employee.position || 'Jabatan belum diisi'} · {employee.branchName || 'Branch belum diisi'}</span>
                        {!employee.hasRecord && <span className="mt-1 inline-block text-xs font-semibold text-amber-700">Administrasi belum lengkap</span>}
                      </button>
                    ))}
                    {!employees.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Belum ada akun ber-role Pekerja. Minta Admin membuat akun melalui Admin &gt; Users.</p>}
                  </div>
                </div>

                <form id="employee-administration-form" noValidate onSubmit={saveEmployee} className="scroll-mt-4 grid gap-3 sm:grid-cols-2">
                  <h3 className="text-base font-bold text-slate-800 sm:col-span-2">Biodata dan pekerjaan</h3>
                  <label className="text-sm font-medium text-slate-700">Nomor pekerja<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.employeeNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, employeeNumber: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Nama lengkap<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Email<span className="text-red-600"> *</span><input required type="email" className={fieldClass} value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Telepon<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Jabatan<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Departemen<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Branch<span className="text-red-600"> *</span>
                    <select required className={fieldClass} value={employeeForm.branchId} onChange={(e) => setEmployeeForm({ ...employeeForm, branchId: e.target.value })}>
                      <option value="">Pilih branch</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Status kerja<span className="text-red-600"> *</span>
                    <select required className={fieldClass} value={employeeForm.employmentStatus} onChange={(e) => setEmployeeForm({ ...employeeForm, employmentStatus: e.target.value as HrEmployeeSave['employmentStatus'] })}>
                      <option value="ACTIVE">Aktif</option><option value="ON_LEAVE">Cuti</option><option value="RESIGNED">Berakhir / resign</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Agama<span className="text-red-600"> *</span>
                    <select required className={fieldClass} value={employeeForm.religion} onChange={(e) => setEmployeeForm({ ...employeeForm, religion: e.target.value as HrEmployeeSave['religion'] })}>
                      <option value="">Pilih agama</option>
                      <option value="Islam">Islam</option>
                      <option value="Kristen Protestan">Kristen Protestan</option>
                      <option value="Katolik">Katolik</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Buddha">Buddha</option>
                      <option value="Konghucu">Konghucu</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Tanggal lahir<span className="text-red-600"> *</span><input required type="date" className={fieldClass} value={employeeForm.dateOfBirth} onChange={(e) => setEmployeeForm({ ...employeeForm, dateOfBirth: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Kota kelahiran<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.birthCity} onChange={(e) => setEmployeeForm({ ...employeeForm, birthCity: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">NIK<span className="text-red-600"> *</span><input required className={fieldClass} inputMode="numeric" value={employeeForm.nik} onChange={(e) => setEmployeeForm({ ...employeeForm, nik: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">NPWP<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.npwp} onChange={(e) => setEmployeeForm({ ...employeeForm, npwp: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">BPJS Tenaga Kerja<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.bpjsKetenagakerjaan} onChange={(e) => setEmployeeForm({ ...employeeForm, bpjsKetenagakerjaan: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">BPJS Kesehatan<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.bpjsKesehatan} onChange={(e) => setEmployeeForm({ ...employeeForm, bpjsKesehatan: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Jenis kelamin<span className="text-red-600"> *</span>
                    <select required className={fieldClass} value={employeeForm.gender} onChange={(e) => setEmployeeForm({ ...employeeForm, gender: e.target.value as HrEmployeeSave['gender'] })}>
                      <option value="">Pilih jenis kelamin</option><option value="MALE">Laki-laki</option><option value="FEMALE">Perempuan</option><option value="OTHER">Lainnya</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Jenis kontrak<span className="text-red-600"> *</span>
                    <select required className={fieldClass} value={employeeForm.contractType} onChange={(e) => setEmployeeForm({ ...employeeForm, contractType: e.target.value as HrEmployeeSave['contractType'] })}>
                      <option value="">Pilih jenis kontrak</option><option value="PERMANENT">Tetap</option><option value="CONTRACT">Kontrak</option><option value="PROBATION">Probation</option><option value="INTERNSHIP">Magang</option><option value="OTHER">Lainnya</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Mulai kontrak<span className="text-red-600"> *</span><input required type="date" className={fieldClass} value={employeeForm.contractStart} onChange={(e) => setEmployeeForm({ ...employeeForm, contractStart: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Akhir kontrak<span className="text-red-600"> *</span><input required type="date" className={fieldClass} value={employeeForm.contractEnd} onChange={(e) => setEmployeeForm({ ...employeeForm, contractEnd: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Lama kontrak (tahun)<span className="text-red-600"> *</span><input required type="number" min="0" max="99.9" step="0.1" className={fieldClass} value={employeeForm.contractDurationYears} onChange={(e) => setEmployeeForm({ ...employeeForm, contractDurationYears: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">No. Rekening Payroll<span className="text-red-600"> *</span><input required className={fieldClass} inputMode="numeric" value={employeeForm.payrollAccountNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, payrollAccountNumber: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Bank Payroll<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.payrollBankName} onChange={(e) => setEmployeeForm({ ...employeeForm, payrollBankName: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">Alamat<span className="text-red-600"> *</span><textarea required rows={2} className={fieldClass} value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Kontak darurat<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.emergencyContactName} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactName: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Telepon darurat<span className="text-red-600"> *</span><input required className={fieldClass} value={employeeForm.emergencyContactPhone} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactPhone: e.target.value })} /></label>
                  <div className="sm:col-span-2">
                    <button className={buttonClass} disabled={saving || !selectedUserId}>{saving ? 'Menyimpan...' : 'Simpan data pekerja'}</button>
                    {employeeForm.employmentStatus === 'RESIGNED' && <p className="mt-2 text-xs text-amber-800">Status ini akan memblokir login pekerja, tanpa menghapus riwayat atau data akun.</p>}
                  </div>
                </form>
              </div>
              </>}
              <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[1450px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-2 py-3">No. Pekerja</th>
                        <th className="px-2 py-3">Nama</th>
                        <th className="px-2 py-3">Jabatan</th>
                        <th className="px-2 py-3">Branch</th>
                        <th className="px-2 py-3">Kontrak</th>
                        <th className="px-2 py-3">Mulai</th>
                        <th className="px-2 py-3">Berakhir</th>
                        <th className="px-2 py-3">BPJS Tenaga Kerja</th>
                        <th className="px-2 py-3">BPJS Kesehatan</th>
                        <th className="px-2 py-3">Bank Payroll</th>
                        <th className="px-2 py-3">Usia Bekerja</th>
                        <th className="px-2 py-3">Status</th>
                        <th className="px-2 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.userId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-3 font-mono text-xs text-slate-600">{employee.employeeNumber || '-'}</td>
                          <td className="px-2 py-3 font-semibold text-slate-800">{employee.name}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.position || '-'}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.branchName || '-'}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.contractType || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-slate-600">{formatDateDisplay(employee.contractStart)}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-slate-600">{formatDateDisplay(employee.contractEnd)}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.bpjsKetenagakerjaan || '-'}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.bpjsKesehatan || '-'}</td>
                          <td className="px-2 py-3 text-slate-600">{employee.payrollBankName || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-slate-600">{formatEmploymentTenure(employee.contractStart)}</td>
                          <td className="px-2 py-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${employee.employmentStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : employee.employmentStatus === 'RESIGNED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                              {employee.employmentStatus === 'ACTIVE' ? 'Aktif' : employee.employmentStatus === 'ON_LEAVE' ? 'Cuti' : employee.employmentStatus === 'RESIGNED' ? 'Berakhir / resign' : 'Belum lengkap'}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => editEmployee(employee)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                              aria-label={`Edit data ${employee.name}`}
                              title={`Edit ${employee.name}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!employees.length && <p className="py-4 text-sm text-slate-500">Belum ada data pekerja.</p>}
              </div>
            </section>
          )}

          {panel === 'requests' && (
            <div className="space-y-5">
              <section className={sectionClass}>
                <h2 className="text-lg font-bold text-slate-900">Permintaan perubahan profil</h2>
                <div className="mt-4 space-y-3">
                  {(workspace?.profileRequests || []).map((request) => (
                    <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="font-semibold text-slate-800">{request.employeeName} · {request.status}</h3><p className="text-xs text-slate-500">{formatDateTimeWib(request.createdAt)}</p></div>
                        {request.status !== 'PENDING' && <span className="text-xs text-slate-500">{request.reviewNote || 'Tidak ada catatan'}</span>}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        {Object.entries(request.proposedData).map(([field, value]) => <div key={field}><dt className="text-xs text-slate-500">{field}</dt><dd className="font-medium text-slate-800">{value || '—'}</dd></div>)}
                      </dl>
                      {request.status === 'PENDING' && <div className="mt-3 flex flex-wrap gap-2">
                        <input aria-label="Catatan keputusan profil" className={`${fieldClass} max-w-md`} placeholder="Catatan wajib jika menolak" value={decisionNotes[request.id] || ''} onChange={(e) => setDecisionNotes({ ...decisionNotes, [request.id]: e.target.value })} />
                        <button className={buttonClass} disabled={saving} onClick={() => reviewProfile(request, 'APPROVED')}>Setujui</button>
                        <button className={secondaryButtonClass} disabled={saving} onClick={() => reviewProfile(request, 'REJECTED')}>Tolak</button>
                      </div>}
                    </article>
                  ))}
                  {!workspace?.profileRequests.length && <p className="text-sm text-slate-500">Belum ada permintaan perubahan profil.</p>}
                </div>
              </section>
            </div>
          )}

          {panel === 'leave-approval' && (
            <section className={sectionClass}>
              <h2 className="text-lg font-bold text-slate-900">Surat Permohonan Masuk</h2>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">Filter bulan surat masuk
                  <input type="month" className={fieldClass} value={leaveRequestMonth} onChange={(event) => setLeaveRequestMonth(event.target.value)} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">Menampilkan {filteredLeaveRequests.length} dari {leaveRequests.length} surat</span>
                  <button type="button" className={`${buttonClass} inline-flex items-center gap-2`} disabled={!filteredLeaveRequests.length} onClick={() => void downloadLeaveRequestsExcel()}>
                    <Download size={14} /> Download Excel
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-slate-200">
                <table className="min-w-[900px] w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-3">No</th>
                      <th className="border-b border-slate-200 px-3 py-3">Tanggal Surat Masuk</th>
                      <th className="border-b border-slate-200 px-3 py-3">Nama Pekerja</th>
                      <th className="border-b border-slate-200 px-3 py-3">Jabatan</th>
                      <th className="border-b border-slate-200 px-3 py-3">Branch</th>
                      <th className="border-b border-slate-200 px-3 py-3">Nomor Pekerja</th>
                      <th className="border-b border-slate-200 px-3 py-3">Jenis Permohonan</th>
                      <th className="border-b border-slate-200 px-3 py-3">Status</th>
                      <th className="border-b border-slate-200 px-3 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeaveRequests.map((request, index) => {
                      const employee = employees.find((item) => item.userId === request.userId);
                      return (
                        <tr key={request.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{index + 1}</td>
                          <td className="whitespace-nowrap px-3 py-3">{formatDateDisplay(request.createdAt)}</td>
                          <td className="px-3 py-3 font-medium text-slate-800">{request.employeeName || employee?.name || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3">{employee?.position || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3">{employee?.branchName || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3">{employee?.employeeNumber || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3">{leaveTypeLabel(request.type)}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : request.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {leaveStatusLabel(request.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <button type="button" className={secondaryButtonClass} onClick={() => setSelectedLeaveRequestId(request.id)}>Lihat</button>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredLeaveRequests.length && (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">{leaveRequests.length ? 'Tidak ada surat pada bulan yang dipilih.' : 'Belum ada surat permohonan masuk.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {selectedLeaveRequest && (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="leave-request-modal-title"
                  onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLeaveRequestId(null); }}
                >
                  <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 id="leave-request-modal-title" className="text-lg font-bold text-slate-900">Detail Surat Permohonan</h3>
                        <p className="mt-1 text-sm text-slate-600">{selectedLeaveRequest.employeeName || '-' } · {leaveTypeLabel(selectedLeaveRequest.type)}</p>
                      </div>
                      <button type="button" className={secondaryButtonClass} onClick={() => setSelectedLeaveRequestId(null)}>Tutup</button>
                    </div>
                    <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div><dt className="text-xs font-medium text-slate-500">Nomor Pekerja</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{employees.find((item) => item.userId === selectedLeaveRequest.userId)?.employeeNumber || '-'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Tanggal Surat Masuk</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{formatDateDisplay(selectedLeaveRequest.createdAt)}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Status</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{leaveStatusLabel(selectedLeaveRequest.status)}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Tanggal Permohonan</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{formatDateDisplay(selectedLeaveRequest.startDate)} – {formatDateDisplay(selectedLeaveRequest.endDate)}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Lama Hari</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{selectedLeaveRequest.durationDays || calculateRequestDuration(selectedLeaveRequest.type, selectedLeaveRequest.startDate, selectedLeaveRequest.endDate)} hari</dd></div>
                      {selectedLeaveRequest.destinationCity && <div><dt className="text-xs font-medium text-slate-500">Kota Tujuan</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{selectedLeaveRequest.destinationCity}</dd></div>}
                      {selectedLeaveRequest.transportMode && <div><dt className="text-xs font-medium text-slate-500">Kendaraan</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{transportModeLabel(selectedLeaveRequest.transportMode)}</dd></div>}
                    </dl>
                    <div className="mt-5 rounded-lg bg-slate-50 p-4">
                      <h4 className="text-xs font-semibold uppercase text-slate-500">Isi Surat</h4>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{selectedLeaveRequest.reason}</p>
                    </div>
                    {selectedLeaveRequest.reviewNote && <p className="mt-4 text-sm text-slate-600">Catatan HR: {selectedLeaveRequest.reviewNote}</p>}
                    <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
                      <button type="button" className={secondaryButtonClass} onClick={() => void downloadLeaveLetter(
                        selectedLeaveRequest,
                        employees.find((item) => item.userId === selectedLeaveRequest.userId) || { name: selectedLeaveRequest.employeeName || '-' },
                      )}>Download PDF</button>
                      {selectedLeaveRequest.status === 'PENDING' && <div className="flex flex-wrap items-end gap-2">
                        <input aria-label="Catatan keputusan surat permohonan" className={`${fieldClass} mb-0 max-w-xs`} placeholder="Catatan wajib jika menolak" value={decisionNotes[selectedLeaveRequest.id] || ''} onChange={(event) => setDecisionNotes({ ...decisionNotes, [selectedLeaveRequest.id]: event.target.value })} />
                        <button type="button" className={buttonClass} disabled={saving} onClick={() => reviewLeave(selectedLeaveRequest, 'APPROVED')}>Setujui</button>
                        <button type="button" className={secondaryButtonClass} disabled={saving} onClick={() => reviewLeave(selectedLeaveRequest, 'REJECTED')}>Tolak</button>
                      </div>}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {panel === 'attendance' && (
            <section className={sectionClass}>
              <h2 className="text-lg font-bold text-slate-900">Absensi Kehadiran</h2>
              <p className="mt-1 text-sm text-slate-600">Tarik data absensi berdasarkan periode, tahun, bulan, dan cakupan pekerja, lalu unduh hasilnya ke Excel. Periode Bulan menggunakan siklus tanggal 26 bulan sebelumnya sampai tanggal 25.</p>
              <form onSubmit={submitAttendanceReport} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">Filter data
                  <select className={fieldClass} value={reportFilters.filterMode} onChange={(e) => setReportFilters({ ...reportFilters, filterMode: e.target.value as typeof reportFilters.filterMode })}>
                    <option value="TODAY">Hari Ini (Today)</option>
                    <option value="CUSTOM_DATE">Pilih Tanggal</option>
                    <option value="MONTH">Bulan</option>
                    <option value="YEAR">Tahun</option>
                  </select>
                </label>
                {reportFilters.filterMode === 'CUSTOM_DATE' && <label className="text-sm font-medium text-slate-700">Pilih tanggal
                  <input required type="date" max={todayISO()} className={fieldClass} value={reportFilters.date} onChange={(e) => setReportFilters({ ...reportFilters, date: e.target.value })} />
                </label>}
                {(reportFilters.filterMode === 'MONTH' || reportFilters.filterMode === 'YEAR') && <label className="text-sm font-medium text-slate-700">Pilih tahun
                  <select className={fieldClass} value={reportFilters.year} onChange={(e) => setReportFilters({ ...reportFilters, year: Number(e.target.value) })}>
                    {attendanceYears(workspace?.attendance || []).map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>}
                {reportFilters.filterMode === 'MONTH' && <label className="text-sm font-medium text-slate-700">Pilih bulan
                  <select className={fieldClass} value={reportFilters.month} onChange={(e) => setReportFilters({ ...reportFilters, month: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, month - 1, 1))}</option>)}
                  </select>
                </label>}
                <label className="text-sm font-medium text-slate-700">Pilih kategori
                  <select className={fieldClass} value={reportFilters.category} onChange={(e) => setReportFilters({ ...reportFilters, category: e.target.value as typeof reportFilters.category })}>
                    <option value="ALL">Semua Data</option><option value="BRANCH">Branch</option><option value="EMPLOYEE">Nama Pekerja</option>
                  </select>
                </label>
                {reportFilters.category === 'BRANCH' && <label className="text-sm font-medium text-slate-700">Pilih branch
                  <select required className={fieldClass} value={reportFilters.branchId} onChange={(e) => setReportFilters({ ...reportFilters, branchId: e.target.value })}>
                    <option value="">Pilih branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
                  </select>
                </label>}
                {reportFilters.category === 'EMPLOYEE' && <label className="text-sm font-medium text-slate-700">Masukkan nama pekerja
                  <input required maxLength={150} className={fieldClass} value={reportFilters.name} onChange={(e) => setReportFilters({ ...reportFilters, name: e.target.value })} placeholder="Nama pekerja" />
                </label>}
                <div className="flex items-end gap-2"><button className={buttonClass} disabled={reportLoading}>{reportLoading ? 'Menarik data...' : 'Submit'}</button>
                  {reportRows && <button type="button" className={secondaryButtonClass} disabled={!reportRows.length} onClick={() => void downloadAttendanceReport()}>Download Excel</button>}
                </div>
              </form>
              <div className="mt-7 border-t border-slate-200 pt-5">
                <h3 className="font-semibold text-slate-900">Input / Koreksi Kehadiran HR</h3>
                <form onSubmit={saveAttendance} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">Pekerja<select required className={fieldClass} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}><option value="">Pilih pekerja</option>{employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">Tanggal<input required type="date" className={fieldClass} value={attendanceForm.date} onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })} /></label>
                <label className="text-sm font-medium text-slate-700">Status<select className={fieldClass} value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value as HrAttendance['status'] })}><option value="PRESENT">Hadir</option><option value="ABSENT">Tidak hadir</option><option value="REMOTE">Remote</option><option value="LEAVE">Cuti/izin</option></select></label>
                <label className="text-sm font-medium text-slate-700">Check-in<input type="time" className={fieldClass} value={attendanceForm.checkIn} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkIn: e.target.value })} /></label>
                <label className="text-sm font-medium text-slate-700">Check-out<input type="time" className={fieldClass} value={attendanceForm.checkOut} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkOut: e.target.value })} /></label>
                <label className="text-sm font-medium text-slate-700">Catatan<input className={fieldClass} value={attendanceForm.note} onChange={(e) => setAttendanceForm({ ...attendanceForm, note: e.target.value })} /></label>
                <div className="md:col-span-3"><button className={buttonClass} disabled={saving || !selectedUserId}>Simpan kehadiran</button></div>
                </form>
              </div>
              {reportRows && (
                <div className="mt-7 border-t border-slate-200 pt-5">
                  <h3 className="font-semibold text-slate-900">Informasi Data Kehadiran</h3>
                  <AttendanceReportTable rows={reportRows} onEdit={openAttendanceEdit} />
                  <AttendanceSummaryTable rows={reportRows} />
                </div>
              )}
              {attendanceEditRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
                  <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
                    <h3 className="font-semibold text-slate-900">Edit Absensi - {attendanceEditRow.employeeName}</h3>
                    <p className="mt-1 text-sm text-slate-600">{formatDateDisplay(attendanceEditRow.date)}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {([
                        ['checkIn', 'Absen Datang'],
                        ['overtimeCheckIn', 'Lembur Datang'],
                        ['checkOut', 'Absen Pulang'],
                        ['overtimeCheckOut', 'Lembur Pulang'],
                      ] as const).map(([field, label]) => (
                        <label key={field} className="text-sm font-medium text-slate-700">{label}
                          <input type="time" className={fieldClass} value={attendanceEditDraft[field]} onChange={(event) => setAttendanceEditDraft({ ...attendanceEditDraft, [field]: event.target.value })} />
                        </label>
                      ))}
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setAttendanceEditRow(null)}>Batal</button>
                      <button type="button" className={buttonClass} disabled={reportLoading} onClick={() => void saveAttendanceEdit()}>{reportLoading ? 'Menyimpan...' : 'Simpan'}</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {panel === 'documents' && (
            <section className={sectionClass}>
              <h2 className="text-lg font-bold text-slate-900">Dokumen Pekerja</h2>
              <p className="mt-1 text-sm text-slate-600">Dokumen disimpan di database dan hanya tersedia bagi HR serta pekerja pemiliknya. Maksimum 2 MB per berkas; PDF, JPG, PNG.</p>
              <form onSubmit={uploadDocument} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-medium text-slate-700">Pekerja<select required className={fieldClass} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}><option value="">Pilih pekerja</option>{employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.name}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">Judul<input required name="title" maxLength={180} className={fieldClass} /></label>
                <label className="text-sm font-medium text-slate-700">Kategori<input required name="category" maxLength={60} placeholder="Kontrak, identitas, sertifikat..." className={fieldClass} /></label>
                <label className="text-sm font-medium text-slate-700">Berkas<input required name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className={fieldClass} /></label>
                <div className="sm:col-span-2 lg:col-span-4"><button className={buttonClass} disabled={saving || !selectedUserId}>{saving ? 'Mengunggah...' : 'Unggah dokumen'}</button></div>
              </form>
              <DocumentTable rows={workspace?.documents || []} onDownload={downloadDocument} />
            </section>
          )}

          {panel === 'history' && <HistoryTable rows={workspace?.history || []} />}
        </>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {panel === 'worker-profile' && <>
          <section className={`${sectionClass} xl:col-span-2`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-900">Profil Saya</h2><p className="mt-1 text-sm text-slate-600">Informasi administrasi pekerja yang dikelola oleh HR.</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{profile?.employmentStatus || 'Data HR belum lengkap'}</span>
            </div>
            <div className="worker-profile-layout mt-5 grid gap-5 md:grid-cols-[240px_1fr]">
              <div className="flex flex-col items-center">
                <div data-worker-photo-frame className="w-full max-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.12)]">
                  <div className="mb-3 flex h-12 shrink-0 items-center justify-between border-b border-slate-100 pb-2">
                    <img src={getPublicLogoUrl()} alt="Logo Lentera Global Maritim" className="h-9 w-9 object-contain" />
                    <span className="font-serif text-xl font-bold italic tracking-wide text-blue-900">it's Me</span>
                  </div>
                  <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-slate-100">
                    {workerPhotoPreview
                      ? <img src={workerPhotoPreview} alt={`Foto ${profile?.name || currentUser.name}`} className="h-full w-full object-cover" />
                      : <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-400">Foto pekerja</div>}
                  </div>
                  <div className="shrink-0 pt-3 text-center">
                    <p className="truncate text-sm font-bold uppercase tracking-wide text-slate-900">{profile?.name || currentUser.name}</p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">{profile?.employeeNumber || 'Nomor pekerja belum tersedia'}</p>
                  </div>
                </div>
                <label className={`${secondaryButtonClass} mt-3 cursor-pointer text-center`}>
                  Ganti Foto Profil
                  <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={(event) => selectWorkerPhoto(event.target.files?.[0])} />
                </label>
              </div>
            <dl className="worker-profile-details content-start text-[12px]">
              {[
                ['Nama', profile?.name || currentUser.name], ['Nomor pekerja', profile?.employeeNumber || 'Belum diisi HR'],
                ['Email', profile?.email || currentUser.email], ['Telepon', profile?.phone || currentUser.phone || '—'],
                ['Jabatan', profile?.position || currentUser.position || '—'], ['Departemen', profile?.department || currentUser.department || '—'],
                ['Branch', profile?.branchName || currentUser.branch || '—'], ['Usia bekerja', formatEmploymentTenure(profile?.contractStart)],
                ['Tanggal lahir', formatDateDisplay(profile?.dateOfBirth)],
                ['Kota kelahiran', profile?.birthCity || '—'], ['Agama', profile?.religion || '—'],
                ['NIK', profile?.nik || '—'], ['NPWP', profile?.npwp || '—'],
                ['BPJS Tenaga Kerja', profile?.bpjsKetenagakerjaan || '—'], ['BPJS Kesehatan', profile?.bpjsKesehatan || '—'],
                ['Status kontrak', profile?.contractType || '—'], ['Masa kontrak', `${formatDateDisplay(profile?.contractStart)} sampai ${formatDateDisplay(profile?.contractEnd)}`],
                ['Lama kontrak (tahun)', profile?.contractDurationYears ?? '—'], ['No. Rekening Payroll', profile?.payrollAccountNumber || '—'],
                ['Bank Payroll', profile?.payrollBankName || '—'],
                ['Alamat', profile?.address || '—'], ['Kontak darurat', profile?.emergencyContactName || '—'],
                ['Telepon darurat', profile?.emergencyContactPhone || '—'],
              ].map(([label, value]) => (
                <div key={label} className="worker-profile-detail">
                  <dt>{label}</dt>
                  <dd className="worker-profile-colon">:</dd>
                  <dd className="worker-profile-value">{value}</dd>
                </div>
              ))}
            </dl>
            {!profile?.hasRecord && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Data administrasi pekerja belum dilengkapi HR.</p>}
            </div>
          </section>

          <section className={`${sectionClass} xl:col-span-2`}>
            <h2 className="text-lg font-bold text-slate-900">Dokumen Saya</h2>
            <DocumentTable rows={ownDocuments} onDownload={downloadDocument} />
          </section>
          </>}
          {panel === 'worker-attendance' && <section className={`${sectionClass} xl:col-span-2`}>
            <h2 className="text-lg font-bold text-slate-900">Absensi</h2>
            <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4">
              <label className="text-sm font-medium text-slate-700">Jenis absensi
                <select className={fieldClass} value={selectedPunchEvent} onChange={(event) => setSelectedPunchEvent(event.target.value as HrAttendanceEvent)}>
                  {workerAttendanceActions(workspace?.attendance || []).map((action) => (
                    <option key={action.event} value={action.event}>{action.label}</option>
                  ))}
                </select>
              </label>
              {workerAttendanceActions(workspace?.attendance || []).map((action) => action.event === selectedPunchEvent && (
                <div key={action.event} className="mt-[38px] flex w-full justify-center sm:mt-[38px]">
                  <HoldAttendanceButton
                    event={action.event}
                    label={action.label}
                    disabled={action.disabled && !action.completed || punchLoading}
                    busy={punchLoading}
                    onConfirm={confirmAttendance}
                  />
                </div>
              ))}
            </div>
          </section>
          }
          {panel === 'worker-leave' && <section className={`${sectionClass} xl:col-span-2`}>
            <h2 className="text-lg font-bold text-slate-900">Surat Permohonan</h2>
            <p className="mt-1 text-sm text-slate-600">Isi rincian permohonan. Surat dapat dilihat dan diunduh setelah diajukan.</p>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (leaveForm.endDate < leaveForm.startDate) {
                setError('Tanggal selesai tidak boleh mendahului tanggal mulai.');
                return;
              }
              void runMutation(async () => {
                await hrApi.requestLeave(leaveForm);
                setLeaveForm({ type: 'ANNUAL', startDate: '', endDate: '', destinationCity: '', transportMode: '', reason: '' });
              }, 'Surat permohonan dikirim kepada HR.');
            }} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 [&_label]:!text-[12px] [&_input]:!text-[12px] [&_select]:!text-[12px] [&_textarea]:!text-[12px] [font-family:Arial,sans-serif]">
              <label className="text-sm font-medium text-slate-700">Jenis Permohonan
                <select className={fieldClass} value={leaveForm.type} onChange={(e) => {
                  const type = e.target.value as HrLeaveRequest['type'];
                  setLeaveForm({ ...leaveForm, type, destinationCity: type === 'ANNUAL' || type === 'BUSINESS_TRAVEL' ? leaveForm.destinationCity : '', transportMode: type === 'BUSINESS_TRAVEL' ? leaveForm.transportMode : '' });
                }}>
                  <option value="ANNUAL">Cuti Tahunan</option>
                  <option value="BUSINESS_TRAVEL">Perjalanan Dinas</option>
                  <option value="SICK">Sakit</option>
                  <option value="PERSONAL">Izin Pribadi</option>
                  <option value="OTHER">Izin Lainnya</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Lama Hari
                <input readOnly className={`${fieldClass} bg-slate-100`} value={calculateRequestDuration(leaveForm.type, leaveForm.startDate, leaveForm.endDate)} />
              </label>
              <label className="text-sm font-medium text-slate-700">Tanggal mulai<input required type="date" className={fieldClass} value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></label>
              <label className="text-sm font-medium text-slate-700">Tanggal selesai<input required type="date" min={leaveForm.startDate || undefined} className={fieldClass} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></label>
              {(leaveForm.type === 'ANNUAL' || leaveForm.type === 'BUSINESS_TRAVEL') && <label className="text-sm font-medium text-slate-700">Kota Tujuan<input required maxLength={120} className={fieldClass} value={leaveForm.destinationCity} onChange={(e) => setLeaveForm({ ...leaveForm, destinationCity: e.target.value })} /></label>}
              {leaveForm.type === 'BUSINESS_TRAVEL' && <label className="text-sm font-medium text-slate-700">Kendaraan yang Digunakan
                <select required className={fieldClass} value={leaveForm.transportMode} onChange={(e) => setLeaveForm({ ...leaveForm, transportMode: e.target.value as NonNullable<HrLeaveRequest['transportMode']> | '' })}>
                  <option value="">Pilih kendaraan</option><option value="CAR">Mobil</option><option value="PLANE">Pesawat</option><option value="TRAIN">Kereta Api</option><option value="PUBLIC_BUS">Bus umum</option>
                </select>
              </label>}
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Keperluan Permohonan<textarea required rows={4} maxLength={2000} className={fieldClass} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></label>
              <div className="sm:col-span-2"><button className={buttonClass} disabled={saving}>{saving ? 'Mengirim...' : 'Ajukan permohonan'}</button></div>
            </form>
            <LeaveTable rows={ownLeaveRequests} employee={profile || currentUser} onPreview={(request) => openLeaveLetter(request, profile || currentUser)} />
          </section>
          }
          {panel === 'worker-download-payslip' && <section className={`${sectionClass} xl:col-span-2`}>
            <h2 className="text-lg font-bold text-slate-900">Slip Gaji</h2>
            <p className="mt-1 text-sm text-slate-600">Unduh slip gaji milik pekerja berdasarkan periode yang tersedia.</p>
            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Pilih bulan<select className={fieldClass} value={workerDownloadFilters.month} onChange={(event) => { setWorkerDownloadFilters({ ...workerDownloadFilters, month: Number(event.target.value) }); setWorkerPayslipShown(false); }}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, month - 1, 1))}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Pilih tahun<select className={fieldClass} value={workerDownloadFilters.year} onChange={(event) => { setWorkerDownloadFilters({ ...workerDownloadFilters, year: Number(event.target.value) }); setWorkerPayslipShown(false); }}>{workerDownloadYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <div className="flex items-end"><button type="button" className={buttonClass} disabled={workerPayrollLoading} onClick={() => void showWorkerPayroll()}>{workerPayrollLoading ? 'Memuat...' : 'Tampilkan'}</button></div>
            </div>
            {workerPayslipShown && <div className="mt-5">
              {workerPayrollSlips.map((slip) => {
                const formatMoney = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
                return (
                  <div key={`${slip.batchId}-${slip.employeeNumber}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-bold text-slate-900">Slip Gaji {slip.period}</p><p className="mt-1 text-sm text-slate-600">{slip.employeeName} · {slip.position || '-'}</p><p className="text-xs text-slate-500">{slip.slipNumber || slip.employeeNumber}</p></div>
                      <button type="button" className={secondaryButtonClass} onClick={() => { void downloadWorkerPayrollPdf(slip).catch((downloadError) => setError(downloadError instanceof Error ? downloadError.message : 'PDF slip gaji gagal dibuat.')); }}>Unduh PDF</button>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><dt>Gaji pokok</dt><dd>{formatMoney(slip.basicSalary)}</dd></div>
                      <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><dt>Pengurangan</dt><dd>{formatMoney(slip.deductions)}</dd></div>
                      <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><dt>Gaji bruto</dt><dd>{formatMoney(slip.grossIncome)}</dd></div>
                      <div className="flex justify-between rounded-lg bg-blue-50 px-3 py-2 font-bold text-blue-900"><dt>Take home pay</dt><dd>{formatMoney(slip.takeHomePay)}</dd></div>
                    </dl>
                  </div>
                );
              })}
              {!workerPayrollLoading && !workerPayrollSlips.length && <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Belum ada slip gaji final pada periode yang dipilih.</p>}
            </div>}
          </section>
          }
          {panel === 'worker-download-attendance' && <section className={`${sectionClass} xl:col-span-2`}>
            <h2 className="text-lg font-bold text-slate-900">Download Absensi</h2>
            <p className="mt-1 text-sm text-slate-600">Unduh seluruh riwayat absensi pribadi dalam format Excel.</p>
            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Pilih bulan<select className={fieldClass} value={workerDownloadFilters.month} onChange={(event) => { setWorkerDownloadFilters({ ...workerDownloadFilters, month: Number(event.target.value) }); setWorkerAttendanceShown(false); }}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, month - 1, 1))}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Pilih tahun<select className={fieldClass} value={workerDownloadFilters.year} onChange={(event) => { setWorkerDownloadFilters({ ...workerDownloadFilters, year: Number(event.target.value) }); setWorkerAttendanceShown(false); }}>{workerDownloadYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <div className="flex items-end"><button type="button" className={buttonClass} onClick={() => setWorkerAttendanceShown(true)}>Tampilkan</button></div>
            </div>
            {workerAttendanceShown && <div className="mt-5">
              <AttendanceTable rows={filteredWorkerAttendance} />
              <div className="mt-4 flex justify-end"><button type="button" className={buttonClass} disabled={!filteredWorkerAttendance.length} onClick={() => void downloadOwnAttendance(filteredWorkerAttendance)}>Download Excel</button></div>
            </div>}
          </section>
          }
        </div>
      )}
      {attendanceSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Absensi berhasil">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <SuccessCatIllustration />
            <h2 className="mt-4 text-xl font-black text-slate-900">{attendanceSuccess.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{attendanceSuccess.message}</p>
            <button type="button" className={`${buttonClass} mt-5`} onClick={() => setAttendanceSuccess(null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

const DocumentTable: React.FC<{ rows: HrDocument[]; onDownload: (document: HrDocument) => void }> = ({ rows, onDownload }) => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{rows.some((row) => row.employeeName) && <th className="p-2">Pekerja</th>}<th className="p-2">Dokumen</th><th className="p-2">Kategori</th><th className="p-2">Berkas</th><th className="p-2">Tanggal</th><th className="p-2" /></tr></thead>
      <tbody>{rows.map((document) => <tr key={document.id} className="border-b border-slate-100">
        {rows.some((row) => row.employeeName) && <td className="p-2 font-medium text-slate-800">{document.employeeName}</td>}
        <td className="p-2 font-medium text-slate-800">{document.title}</td><td className="p-2 text-slate-600">{document.category}</td>
        <td className="p-2 text-slate-600">{document.fileName} · {formatFileSize(document.fileSize)}</td><td className="p-2 text-slate-500">{document.uploadedAt}</td>
        <td className="p-2"><button type="button" className={secondaryButtonClass} onClick={() => onDownload(document)}>Unduh</button></td>
      </tr>)}</tbody>
    </table>
    {!rows.length && <p className="py-4 text-sm text-slate-500">Belum ada dokumen.</p>}
  </div>
);

const AttendanceTable: React.FC<{ rows: HrAttendance[] }> = ({ rows }) => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[580px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{rows.some((row) => row.employeeName) && <th className="p-2">Pekerja</th>}<th className="p-2">Tanggal Absen</th><th className="p-2">Status</th><th className="p-2">Absen Datang</th><th className="p-2">Lembur Datang</th><th className="p-2">Absen Pulang</th><th className="p-2">Lembur Pulang</th><th className="p-2">Catatan HR</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100">
        {rows.some((item) => item.employeeName) && <td className="p-2 font-medium text-slate-800">{row.employeeName}</td>}
        <td className="p-2">{formatDateDisplay(row.date)}</td>
        <td className="p-2">{{ PRESENT: 'Hadir', ABSENT: 'Tidak hadir', REMOTE: 'Remote', LEAVE: 'Cuti/Izin' }[row.status]}</td>
        <td className="p-2">{formatAttendanceTime(row.checkInAt || row.checkIn)}</td>
        <td className="p-2">{formatAttendanceTime(row.overtimeCheckInAt)}</td>
        <td className="p-2">{formatAttendanceTime(row.checkOutAt || row.checkOut)}</td>
        <td className="p-2">{formatAttendanceTime(row.overtimeCheckOutAt)}</td>
        <td className="p-2 text-slate-600">{row.note || '—'}</td>
      </tr>)}</tbody>
    </table>
    {!rows.length && <p className="py-4 text-sm text-slate-500">Belum ada catatan kehadiran.</p>}
  </div>
);

const formatAttendanceTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = value.replace('T', ' ');
  return date.length >= 16 ? date.slice(11, 19) : date;
};

const attendanceInputTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const formatted = formatAttendanceTime(value);
  return formatted === '—' ? '' : formatted.slice(0, 5);
};

const locationText = (
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
  accuracy: number | string | null | undefined,
) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined
    || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return <a className="mt-1 block text-xs text-blue-700 underline" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
    {lat.toFixed(5)}, {lng.toFixed(5)}{accuracy !== null && accuracy !== undefined ? ` (±${Math.round(Number(accuracy))} m)` : ''}
  </a>;
};

const locationExportValue = (
  latitude: number | string | null,
  longitude: number | string | null,
  accuracy: number | string | null,
) => {
  if (latitude === null || longitude === null) return '';
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy === null ? '' : ` (akurasi ±${Math.round(Number(accuracy))} m)`}`;
};

const attendanceExportRow = (row: HrAttendanceReportRow) => ({
  date: row.date,
  employeeName: row.employeeName,
  employeeNumber: row.employeeNumber || '',
  position: row.position || '',
  branchName: row.branchName || '',
  department: row.department || '',
  checkInAt: formatAttendanceTime(row.checkInAt),
  checkInLocation: locationExportValue(row.checkInLatitude, row.checkInLongitude, row.checkInAccuracyMeters),
  overtimeCheckInAt: formatAttendanceTime(row.overtimeCheckInAt),
  overtimeCheckInLocation: locationExportValue(row.overtimeCheckInLatitude, row.overtimeCheckInLongitude, row.overtimeCheckInAccuracyMeters),
  checkOutAt: formatAttendanceTime(row.checkOutAt),
  checkOutLocation: locationExportValue(row.checkOutLatitude, row.checkOutLongitude, row.checkOutAccuracyMeters),
  overtimeCheckOutAt: formatAttendanceTime(row.overtimeCheckOutAt),
  overtimeCheckOutLocation: locationExportValue(row.overtimeCheckOutLatitude, row.overtimeCheckOutLongitude, row.overtimeCheckOutAccuracyMeters),
  note: attendanceStatus(row).join('; '),
});

const overtimeDuration = (row: HrAttendanceReportRow): string => {
  const start = attendanceTimeMinutes(row.overtimeCheckInAt);
  const end = attendanceTimeMinutes(row.overtimeCheckOutAt);
  if (start === null || end === null) return '-';
  const minutes = end >= start ? end - start : 1440 - start + end;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} jam${remainder ? ` ${remainder} menit` : ''}`;
};

const overtimeSummary = (rows: HrAttendanceReportRow[]) => {
  const employees = new Map<string, {
    employeeName: string;
    employeeNumber: string;
    position: string;
    branchName: string;
    department: string;
    days: number;
    hours: string;
    totalMinutes: number;
  }>();
  rows.forEach((row) => {
    const employee = employees.get(row.userId) || {
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber || '',
      position: row.position || '',
      branchName: row.branchName || '',
      department: row.department || '',
      days: 0,
      hours: '',
      totalMinutes: 0,
    };
    const start = attendanceTimeMinutes(row.overtimeCheckInAt);
    const end = attendanceTimeMinutes(row.overtimeCheckOutAt);
    if (start !== null && end !== null) employee.totalMinutes += end >= start ? end - start : 1440 - start + end;
    employee.days += 1;
    employees.set(row.userId, employee);
  });
  return [...employees.values()].map((employee) => ({
    ...employee,
    hours: `${(employee.totalMinutes / 60).toFixed(2)} jam`,
  }));
};

const attendanceSummary = (rows: HrAttendanceReportRow[]) => {
  const employees = new Map<string, {
    employeeName: string;
    employeeNumber: string;
    position: string;
    branchName: string;
    department: string;
    present: number;
    sick: number;
    leave: number;
    absent: number;
  }>();
  rows.forEach((row) => {
    const employee = employees.get(row.userId) || {
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber || '',
      position: row.position || '',
      branchName: row.branchName || '',
      department: row.department || '',
      present: 0,
      sick: 0,
      leave: 0,
      absent: 0,
    };
    if (row.leaveType === 'SICK') employee.sick += 1;
    else if (row.status === 'LEAVE') employee.leave += 1;
    else if (row.status === 'ABSENT' || row.checkInAt === null && attendanceStatus(row).includes('Anda tidak absen datang')) employee.absent += 1;
    else if (row.checkInAt || row.status === 'PRESENT' || row.status === 'REMOTE') employee.present += 1;
    employees.set(row.userId, employee);
  });
  return [...employees.values()];
};

const AttendanceSummaryTable: React.FC<{ rows: HrAttendanceReportRow[] }> = ({ rows }) => (
  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
    <h4 className="bg-slate-50 px-4 py-3 font-semibold text-slate-900">Ringkasan Kehadiran Pekerja</h4>
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-100 text-xs uppercase text-slate-600">
        <tr>
          {['Nama Pekerja', 'Nomor Pekerja', 'Jabatan', 'Branch', 'Departemen', 'Jumlah Kehadiran', 'Sakit', 'Cuti/Izin', 'Tidak Absen'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
        </tr>
      </thead>
      <tbody>
        {attendanceSummary(rows).map((summary) => (
          <tr key={summary.employeeName} className="border-t border-slate-100">
            <td className="px-4 py-3 font-semibold">{summary.employeeName}</td>
            <td className="px-4 py-3">{summary.employeeNumber || '-'}</td>
            <td className="px-4 py-3">{summary.position || '-'}</td>
            <td className="px-4 py-3">{summary.branchName || '-'}</td>
            <td className="px-4 py-3">{summary.department || '-'}</td>
            <td className="px-4 py-3">{summary.present}</td>
            <td className="px-4 py-3">{summary.sick}</td>
            <td className="px-4 py-3">{summary.leave}</td>
            <td className="px-4 py-3">{summary.absent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const attendanceTimeMinutes = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(/(?:T|\s)(\d{2}):(\d{2})(?::\d{2})?/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const legacy = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return legacy ? Number(legacy[1]) * 60 + Number(legacy[2]) : null;
};

const attendanceStatus = (row: HrAttendanceReportRow): string[] => {
  if (row.status === 'LEAVE') {
    return [row.leaveType ? `${leaveTypeLabel(row.leaveType)} disetujui HR` : 'Cuti/Izin'];
  }
  const date = new Date(`${row.date}T12:00:00`);
  const day = date.getDay();
  if (day === 0 || day === 6) return ['Libur Operasional'];

  const notes: string[] = [];
  const checkInMinutes = attendanceTimeMinutes(row.checkInAt);
  const now = new Date();
  const datePassed = row.date < todayISO();
  const cutoffPassed = row.date === todayISO() && now.getHours() * 60 + now.getMinutes() > 720;

  if (checkInMinutes === null && (datePassed || cutoffPassed)) {
    notes.push('Anda tidak absen datang');
  } else if (checkInMinutes !== null && checkInMinutes > 540) {
    notes.push('Anda absen datang telat');
  }

  if (attendanceTimeMinutes(row.checkOutAt) === null && datePassed) {
    notes.push('Tidak absen pulang');
  }
  if (!notes.length) notes.push(checkInMinutes !== null ? 'Hadir' : 'Menunggu absensi datang');
  return notes;
};

const attendanceYears = (rows: HrAttendance[]) => {
  const years = new Set<number>([Number(todayISO().slice(0, 4))]);
  rows.forEach((row) => {
    const year = Number(row.date.slice(0, 4));
    if (Number.isInteger(year) && year >= 2000) years.add(year);
  });
  return [...years].sort((left, right) => right - left);
};

const attendanceEventLabel = (event: HrAttendanceEvent) => ({
  CHECK_IN: 'Absen datang',
  OVERTIME_CHECK_IN: 'Absen lembur datang',
  CHECK_OUT: 'Absen pulang',
  OVERTIME_CHECK_OUT: 'Absen lembur pulang',
}[event]);

const workerAttendanceActions = (rows: HrAttendance[]) => {
  const today = todayISO();
  const record = rows.find((row) => row.date === today);
  const checkedIn = !!(record?.checkInAt || record?.checkIn);
  const checkedOut = !!(record?.checkOutAt || record?.checkOut);
  const overtimeCheckedIn = !!record?.overtimeCheckInAt;
  const overtimeCheckedOut = !!record?.overtimeCheckOutAt;
  const onLeave = record?.status === 'LEAVE';
  return [
    { event: 'CHECK_IN' as const, label: 'Absen Datang', disabled: checkedIn || onLeave, completed: checkedIn },
    { event: 'CHECK_OUT' as const, label: 'Absen Pulang', disabled: !checkedIn || checkedOut || onLeave, completed: checkedOut },
    { event: 'OVERTIME_CHECK_IN' as const, label: 'Absen Lembur Datang', disabled: !checkedIn || !checkedOut || overtimeCheckedIn || onLeave, completed: overtimeCheckedIn },
    { event: 'OVERTIME_CHECK_OUT' as const, label: 'Absen Lembur Pulang', disabled: !overtimeCheckedIn || overtimeCheckedOut || onLeave, completed: overtimeCheckedOut },
  ];
};

const workerAttendanceRecordedTime = (rows: HrAttendance[], event: HrAttendanceEvent): string => {
  const record = rows.find((row) => row.date === todayISO());
  if (!record) return '—';
  const value = {
    CHECK_IN: record.checkInAt || record.checkIn,
    OVERTIME_CHECK_IN: record.overtimeCheckInAt,
    CHECK_OUT: record.checkOutAt || record.checkOut,
    OVERTIME_CHECK_OUT: record.overtimeCheckOutAt,
  }[event];
  return formatAttendanceTime(value);
};

const AttendanceReportTable: React.FC<{ rows: HrAttendanceReportRow[]; onEdit: (row: HrAttendanceReportRow) => void }> = ({ rows, onEdit }) => (
  <div className="mt-5 rounded-xl border border-slate-200">
    <table className="w-full table-fixed text-left text-[11px]">
      <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
        <tr>
          {['Tanggal Absen', 'Nama pekerja', 'Nomor pekerja', 'Jabatan', 'Branch', 'Departemen', 'Absen Datang', 'Lokasi Absen Datang', 'Lembur Datang', 'Lokasi Lembur Datang', 'Absen Pulang', 'Lokasi Absen Pulang', 'Lembur Pulang', 'Lokasi Lembur Pulang', 'Keterangan', 'Aksi'].map((heading) => <th key={heading} className="break-words p-2">{heading}</th>)}
        </tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={`${row.userId}-${row.date}`} className="border-t border-slate-100">
        <td className="break-words p-2">{formatDateDisplay(row.date)}</td>
        <td className="break-words p-2 font-semibold">{row.employeeName}</td>
        <td className="break-words p-2">{row.employeeNumber || '-'}</td>
        <td className="break-words p-2">{row.position || '-'}</td>
        <td className="break-words p-2">{row.branchName || '-'}</td>
        <td className="break-words p-2">{row.department || '-'}</td>
        <td className={`break-words p-2 ${attendanceStatus(row).some((note) => note.includes('telat') || note.includes('tidak absen datang')) ? 'font-bold text-red-600' : ''}`}>{formatAttendanceTime(row.checkInAt)}</td>
        <td className="break-words p-2">{locationText(row.checkInLatitude, row.checkInLongitude, row.checkInAccuracyMeters) || '—'}</td>
        <td className="break-words p-2">{formatAttendanceTime(row.overtimeCheckInAt)}</td>
        <td className="break-words p-2">{locationText(row.overtimeCheckInLatitude, row.overtimeCheckInLongitude, row.overtimeCheckInAccuracyMeters) || '—'}</td>
        <td className={`break-words p-2 ${attendanceStatus(row).includes('Tidak absen pulang') ? 'font-bold text-red-600' : ''}`}>{formatAttendanceTime(row.checkOutAt)}</td>
        <td className="break-words p-2">{locationText(row.checkOutLatitude, row.checkOutLongitude, row.checkOutAccuracyMeters) || '—'}</td>
        <td className="break-words p-2">{formatAttendanceTime(row.overtimeCheckOutAt)}</td>
        <td className="break-words p-2">{locationText(row.overtimeCheckOutLatitude, row.overtimeCheckOutLongitude, row.overtimeCheckOutAccuracyMeters) || '—'}</td>
        <td className="break-words p-2 font-bold">
          {attendanceStatus(row).map((note) => {
            const approvedLeave = note === 'Cuti/Izin' || note.endsWith(' disetujui HR');
            const colorClass = approvedLeave
              ? 'text-blue-600'
              : note !== 'Hadir' && note !== 'Libur Operasional'
                ? 'text-red-600'
                : 'text-slate-700';
            return <span key={note} className={`block ${colorClass}`}>{note}</span>;
          })}
        </td>
        <td className="p-2">
          <button type="button" className="rounded-lg border border-slate-300 p-1.5 text-blue-700 hover:bg-blue-50" onClick={() => onEdit(row)} aria-label={`Edit absensi ${row.employeeName}`} title="Edit absensi">
            <Pencil className="h-4 w-4" />
          </button>
        </td>
      </tr>)}</tbody>
    </table>
    {!rows.length && <p className="p-5 text-sm text-slate-500">Tidak ada data absensi untuk filter yang dipilih.</p>}
  </div>
);

const SuccessCatIllustration = () => (
  <svg className="mx-auto h-36 w-36" viewBox="0 0 180 180" role="img" aria-label="Ilustrasi kucing bahagia">
    <circle cx="90" cy="90" r="78" fill="#fff7cc" stroke="#f59e0b" strokeWidth="4" />
    <path d="M47 64 38 28l35 24M133 64l9-36-35 24" fill="#f59e0b" stroke="#92400e" strokeWidth="5" strokeLinejoin="round" />
    <path d="M48 64c8-22 76-22 84 0 15 43-7 78-42 78S33 107 48 64Z" fill="#fbbf24" stroke="#92400e" strokeWidth="5" />
    <path d="M58 84c7-8 15-8 22 0M100 84c7-8 15-8 22 0" fill="none" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
    <path d="m82 97 8 7 8-7Z" fill="#78350f" />
    <path d="M90 104c-2 12-16 13-20 3M90 104c2 12 16 13 20 3" fill="none" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
    <path d="m38 102-20-5M39 113l-21 5M142 102l20-5M141 113l21 5" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

interface HoldAttendanceButtonProps {
  event: HrAttendanceEvent;
  label: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: (event: HrAttendanceEvent) => void;
}

const HoldAttendanceButton: React.FC<HoldAttendanceButtonProps> = ({ event, label, disabled, busy, onConfirm }) => {
  const [progress, setProgress] = useState(0);
  const timer = React.useRef<number | null>(null);
  const startedAt = React.useRef(0);
  const isHolding = React.useRef(false);
  const holdDuration = 2500;

  const stop = () => {
    isHolding.current = false;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  const begin = () => {
    if (disabled || busy || isHolding.current) return;
    isHolding.current = true;
    startedAt.current = performance.now();
    timer.current = window.setInterval(() => {
      const percent = Math.min(100, ((performance.now() - startedAt.current) / holdDuration) * 100);
      setProgress(percent);
      if (percent >= 100) {
        stop();
        onConfirm(event);
      }
    }, 40);
  };

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onPointerDown={(pointerEvent) => {
          if (pointerEvent.button !== undefined && pointerEvent.button !== 0) return;
          pointerEvent.preventDefault();
          begin();
          try { pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId); } catch { /* Pointer capture is optional on older mobile browsers. */ }
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(keyEvent) => {
          if ((keyEvent.key === ' ' || keyEvent.key === 'Enter') && !keyEvent.repeat) {
            keyEvent.preventDefault();
            begin();
          }
        }}
        onKeyUp={(keyEvent) => {
          if (keyEvent.key === ' ' || keyEvent.key === 'Enter') stop();
        }}
        onContextMenu={(eventContext) => eventContext.preventDefault()}
        className="relative mx-auto h-36 w-36 touch-none rounded-full transition-transform duration-150 active:scale-105 disabled:cursor-not-allowed disabled:opacity-60 sm:h-40 sm:w-40"
        aria-label={`${label}. Sentuh dan tahan selama dua setengah detik untuk absensi.`}
        style={{ background: `conic-gradient(#2563eb ${progress * 3.6}deg, #dbeafe 0deg)` }}
      >
        <span className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-2xl font-black text-blue-700 shadow-sm">
          {progress > 0 ? `${Math.ceil(progress)}%` : (
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 11V7" strokeLinecap="round" />
              <path d="M9.5 11V6.5a2.5 2.5 0 0 1 5 0V11" strokeLinecap="round" />
              <path d="M7.5 13v-1.5a1.5 1.5 0 0 1 3 0V13" strokeLinecap="round" />
              <path d="M13.5 11.5a1.5 1.5 0 0 1 3 0V14" strokeLinecap="round" />
              <path d="M7.5 13v2a4.5 4.5 0 0 0 9 0v-1" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </button>
      <span className="text-sm font-bold tracking-wide text-blue-800">Hold Me</span>
    </div>
  );
};

const leaveTypeLabel = (type: HrLeaveRequest['type']) => ({
  ANNUAL: 'Cuti Tahunan',
  BUSINESS_TRAVEL: 'Perjalanan Dinas',
  SICK: 'Sakit',
  PERSONAL: 'Izin Pribadi',
  OTHER: 'Izin Lainnya',
}[type]);

const transportModeLabel = (mode: NonNullable<HrLeaveRequest['transportMode']>) => ({
  CAR: 'Mobil',
  PLANE: 'Pesawat',
  TRAIN: 'Kereta Api',
  PUBLIC_BUS: 'Bus umum',
}[mode]);

const leaveStatusLabel = (status: HrLeaveRequest['status']) => ({
  PENDING: 'Pending HR',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
}[status]);

const LeaveTable: React.FC<{
  rows: HrLeaveRequest[];
  employee?: {
    name: string;
    position?: string | null;
    employeeNumber?: string | null;
    nik?: string | null;
    department?: string | null;
  };
  onPreview?: (request: HrLeaveRequest) => void;
}> = ({ rows, employee, onPreview }) => (
  <div className="mt-5 max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain pr-2">
    {rows.map((request) => <div key={request.id} className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><b>{leaveTypeLabel(request.type)} · {leaveStatusLabel(request.status)}</b><span className="text-xs text-slate-500">{formatDateDisplay(request.startDate)} – {formatDateDisplay(request.endDate)}</span></div>
      <div className="mt-2 grid gap-1 text-xs text-slate-500">
        <span>Tanggal dibuat surat: {formatDateDisplay(request.createdAt)}</span>
        <span>Status permohonan: {leaveStatusLabel(request.status)}</span>
        <span>Lama hari: {request.durationDays || calculateRequestDuration(request.type, request.startDate, request.endDate)} hari</span>
        {request.destinationCity && <span>Kota tujuan: {request.destinationCity}</span>}
        {request.transportMode && <span>Kendaraan: {transportModeLabel(request.transportMode)}</span>}
      </div>
      <p className="mt-1 text-slate-600">{request.reason}</p>
      {request.reviewNote && <p className="mt-1 text-xs text-slate-500">Catatan HR: {request.reviewNote}</p>}
      {onPreview && <div className="mt-3 flex gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => onPreview(request)}>Lihat surat</button>
        <button type="button" className={buttonClass} onClick={() => downloadLeaveLetter(request, employee)}>Download PDF</button>
      </div>}
    </div>)}
    {!rows.length && <p className="text-sm text-slate-500">Belum ada pengajuan cuti/izin.</p>}
  </div>
);

const imageUrlToDataUrl = async (url: string): Promise<string | null> => {
  let sourceUrl = '';
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    sourceUrl = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Logo tidak dapat dibaca.'));
      nextImage.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  } finally {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
};

const createLeaveLetterPdf = async (request: HrLeaveRequest, employee?: {
  name: string;
  position?: string | null;
  employeeNumber?: string | null;
  nik?: string | null;
  department?: string | null;
}) => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const logoDataUrl = await imageUrlToDataUrl(getPublicLogoUrl());
  const verificationUrl = new URL('/', window.location.origin);
  verificationUrl.searchParams.set('verifikasi', request.id);
  const verificationQr = await QRCode.toDataURL(verificationUrl.toString(), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });

  if (logoDataUrl) pdf.addImage(logoDataUrl, 'JPEG', 24, 10, 27, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('PT. LENTERA GLOBAL MARITIM', 165, 17, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Seamless Agent, Global Reach', 165, 23, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setFillColor(38, 99, 235);
  pdf.rect(20, 35, 170, 11, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.text('SURAT PERMOHONAN', pageWidth / 2, 42, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let y = 55;
  const addText = (text: string, gapAfter = 0, x = 20, indent = 0) => {
    const lines = pdf.splitTextToSize(text, 170 - indent) as string[];
    for (const line of lines) {
      if (y > 259) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, x + indent, y);
      y += 5;
    }
    y += gapAfter;
  };
  const addBulletField = (label: string, value: string | undefined, gapAfter = 0, indent = 0) => {
    const valueText = value || '-';
    if (y > 259) {
      pdf.addPage();
      y = 20;
    }
    const bulletX = 20 + indent;
    const labelX = 30 + indent;
    const colonX = 70 + indent;
    const valueX = colonX + pdf.getTextWidth(': ');
    const valueLines = pdf.splitTextToSize(valueText, pageWidth - 20 - valueX) as string[];
    pdf.text('- ', bulletX, y);
    pdf.text(label, labelX, y);
    pdf.text(':', colonX, y);
    valueLines.forEach((line, index) => {
      if (index > 0) {
        if (y > 259) {
          pdf.addPage();
          y = 20;
        }
        y += 5;
      }
      pdf.text(line, valueX, y);
    });
    y += 5;
    y += gapAfter;
  };
  const addSectionBreak = (gap = 4) => {
    y += gap;
  };
  const duration = request.durationDays || calculateRequestDuration(request.type, request.startDate, request.endDate);
  const durationUnit = ['ANNUAL', 'PERSONAL', 'OTHER'].includes(request.type) ? 'Hari kerja' : 'Hari';
  const employeeNumber = employee?.employeeNumber;
  const nik = employee?.nik;
  const department = employee?.department;
  addText(`Perihal: Permohonan ${leaveTypeLabel(request.type)} - ${employee?.name || '-'}`, 0);
  addText('Kepada Yth.', 0);
  addText('Bagian HRD / Personalia', 0);
  addText('PT. Lentera Global Maritim', 0);
  addText('Di Tempat', 0);
  addSectionBreak(4);
  addText('Dengan hormat,');
  addText('Saya yang bertanda tangan di bawah ini:');
  addBulletField('Nama', employee?.name || '-');
  addBulletField('NIK / No. Karyawan', nik || employeeNumber || '-');
  addBulletField('Jabatan', employee?.position || '-');
  addBulletField('Departemen', department || '-');
  addSectionBreak(2);
  addText(`Bersama surat ini, saya bermaksud mengajukan permohonan ${leaveTypeLabel(request.type)} dengan rincian sebagai berikut:`);
  addBulletField('Tanggal Mulai', formatDateDisplay(request.startDate));
  addBulletField('Tanggal Selesai', formatDateDisplay(request.endDate));
  addBulletField('Lama Hari', `${duration} ${durationUnit}`);
  if (request.destinationCity) addBulletField('Kota Tujuan', request.destinationCity);
  if (request.transportMode) addBulletField('Kendaraan yang Digunakan', transportModeLabel(request.transportMode));
  addBulletField(`Keperluan${request.type === 'BUSINESS_TRAVEL' ? ' / Agenda Dinas' : ''}`, request.reason);
  addSectionBreak(2);
  if (request.type === 'ANNUAL') {
    addText('Selama menjalankan cuti, saya akan memastikan seluruh tanggung jawab pekerjaan telah diserahterimakan dengan baik atau didelegasikan kepada rekan kerja satu tim.');
  } else if (request.type === 'BUSINESS_TRAVEL') {
    addText('Sehubungan dengan penugasan ini, saya memohon bantuan bagian HRD/GA terkait akomodasi dan administrasi perjalanan yang diperlukan.');
  } else if (request.type === 'SICK') {
    addText('Sebagai bukti pendukung, saya melampirkan Surat Keterangan Sakit dari Dokter/Rumah Sakit bersamaan dengan formulir ini.');
  } else if (request.type === 'PERSONAL') {
    addText('Saya memohon maaf atas ketidakhadiran saya pada tanggal tersebut karena adanya urusan mendesak yang tidak dapat ditinggalkan.');
  } else {
    addText('Demikian permohonan izin ini saya sampaikan atas situasi/kondisi khusus di atas.');
  }
  addSectionBreak(3);
  addText('Demikian permohonan ini saya ajukan. Atas perhatian, pengertian, dan persetujuan dari Bapak/Ibu HRD, saya ucapkan terima kasih.');
  if (y > 205) {
    pdf.addPage();
    y = 30;
  }
  y = Math.max(y + 7, 205);
  pdf.setLineHeightFactor(1);
  pdf.text(`Jakarta, ${formatDateDisplay(request.createdAt)}`, 145, y, { align: 'center' });
  pdf.text('Hormat Saya,', 145, y + 7, { align: 'center' });
  pdf.text(`( ${employee?.name || '-'} )`, 145, y + 27, { align: 'center' });
  pdf.addImage(verificationQr, 'PNG', 24, y - 5, 24, 24);
  pdf.setFontSize(7);
  pdf.text('Pindai untuk verifikasi', 36, y + 22, { align: 'center' });

  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.3);
    pdf.line(20, 270, 190, 270);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan', pageWidth / 2, 276, { align: 'center' });
    pdf.text('Kota Adm Jakarta Selatan, DKI Jakarta - 12810', pageWidth / 2, 280, { align: 'center' });
    pdf.setTextColor(220, 38, 38);
    pdf.text('email : maritim@lentera-global.com / web : www.lentera-global.com', pageWidth / 2, 284, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }
  return pdf;
};

const downloadLeaveLetter = async (request: HrLeaveRequest, employee?: { name: string; position?: string | null }) => {
  const pdf = await createLeaveLetterPdf(request, employee);
  const fileName = `surat-permohonan-${request.id}.pdf`;
  if (isAndroidApp()) {
    const contentBase64 = pdf.output('datauristring').split(',', 2)[1];
    if (!contentBase64) throw new Error('Isi PDF surat gagal dibuat.');
    await androidNative.downloadBase64(fileName, 'application/pdf', contentBase64);
  } else {
    pdf.save(fileName);
  }
};

const openLeaveLetter = (request: HrLeaveRequest, employee?: { name: string; position?: string | null }) => {
  const fileName = `surat-permohonan-${request.id}.pdf`;
  if (isAndroidApp()) {
    void createLeaveLetterPdf(request, employee)
      .then(async (pdf) => {
        const contentBase64 = pdf.output('datauristring').split(',', 2)[1];
        if (!contentBase64) throw new Error('Isi PDF surat gagal dibuat.');
        await androidNative.openPdf(fileName, contentBase64);
      })
      .catch((openError) => {
        window.alert(openError instanceof Error ? openError.message : 'PDF surat gagal dibuka.');
      });
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('Izinkan popup browser untuk membuka surat permohonan.');
    return;
  }

  void createLeaveLetterPdf(request, employee).then((pdf) => {
    const pdfData = pdf.output('datauristring');
    popup.document.title = `Surat Permohonan - ${employee?.name || '-'}`;
    popup.document.body.innerHTML = `
      <style>
        html,body{height:100%;margin:0;background:#e2e8f0;font-family:Arial,sans-serif}
        header{height:56px;background:#fff;border-bottom:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center}
        a{background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:14px}
        iframe{display:block;width:100%;height:calc(100% - 57px);border:0;background:#fff}
      </style>
      <header><a href="${pdfData}" download="${fileName}">Download PDF</a></header>
      <iframe title="Surat Permohonan" src="${pdfData}"></iframe>
    `;
    popup.document.close();
  });
};

const administrativeHistoryTypes = new Set([
  'ATTENDANCE_UPDATED', 'ABSEN_DATANG', 'ABSEN_PULANG', 'ABSEN_LEMBUR_DATANG',
  'ABSEN_LEMBUR_PULANG', 'CHECK_IN', 'CHECK_OUT', 'OVERTIME_CHECK_IN', 'OVERTIME_CHECK_OUT',
]);

const HistoryTable: React.FC<{ rows: HrHistoryEntry[] }> = ({ rows }) => {
  const administrativeRows = rows.filter((row) => !administrativeHistoryTypes.has(row.eventType));
  return (
  <section className={sectionClass}>
    <h2 className="text-lg font-bold text-slate-900">Riwayat Administrasi</h2>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-2">Waktu</th><th className="p-2">Pekerja</th><th className="p-2">Aktivitas</th><th className="p-2">Pelaksana</th></tr></thead>
        <tbody>{administrativeRows.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="p-2 text-slate-500">{formatDateTimeWib(row.createdAtWib || row.createdAt)}</td><td className="p-2">{row.employeeName || row.userId}</td><td className="p-2">{row.summary}</td><td className="p-2">{row.actorName}</td></tr>)}</tbody>
      </table>
      {!administrativeRows.length && <p className="py-4 text-sm text-slate-500">Belum ada riwayat administrasi.</p>}
    </div>
  </section>
  );
};
