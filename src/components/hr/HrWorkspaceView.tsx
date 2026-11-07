import React, { useCallback, useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { Pencil } from 'lucide-react';
import { AuthAccount } from '../../auth';
import {
  hrApi,
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
} from '../../lib/api';
import { formatDateDisplay, formatDateTimeWib, todayISO } from '../../utils/date';
import { getPublicLogoUrl } from '../../utils/logo';

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
  contractType: '',
  contractStart: '',
  contractEnd: '',
  contractDurationYears: '',
  nik: '',
  npwp: '',
  payrollAccountNumber: '',
  payrollBankName: '',
};

const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

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
  contractType: employee.contractType || '',
  contractStart: employee.contractStart || '',
  contractEnd: employee.contractEnd || '',
  contractDurationYears: employee.contractDurationYears === null ? '' : String(employee.contractDurationYears),
  nik: employee.nik || '',
  npwp: employee.npwp || '',
  payrollAccountNumber: employee.payrollAccountNumber || '',
  payrollBankName: employee.payrollBankName || '',
});

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
    reason: '',
  });
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState('');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [workerDownloadFilters, setWorkerDownloadFilters] = useState({
    year: Number(todayISO().slice(0, 4)),
    month: Number(todayISO().slice(5, 7)),
  });
  const [workerAttendanceShown, setWorkerAttendanceShown] = useState(false);
  const [workerPayslipShown, setWorkerPayslipShown] = useState(false);
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

  const saveEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    void runMutation(() => hrApi.saveEmployee(employeeForm), 'Data pekerja berhasil disimpan.');
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
      if (await reload()) setNotice(`${attendanceEventLabel(event)} berhasil dicatat pada ${result.occurredAt}.`);
      const lateCheckIn = event === 'CHECK_IN' && attendanceTimeMinutes(result.occurredAt) > 540;
      const attendanceTime = formatAttendanceTime(result.occurredAt);
      setAttendanceSuccess({
        title: lateCheckIn ? 'Anda absen datang telat' : 'Absensi berhasil',
        message: event === 'CHECK_IN'
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
    ? 'Tinjau, lihat, dan putuskan surat permohonan cuti atau izin dari pekerja.'
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
              <h2 className="text-lg font-bold text-slate-900">Data Pekerja</h2>
              <p className="mt-1 text-sm text-slate-600">Akun role Pekerja dikelola Admin di menu Users; HR melengkapi administrasi pekerja di sini.</p>
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
                        : <span className="px-4 text-xs text-slate-400">Foto 4 × 6</span>}
                    </div>
                    <label className={`${secondaryButtonClass} mt-3 inline-block cursor-pointer`}>
                      Upload photo
                      <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={(event) => selectEmployeePhoto(event.target.files?.[0])} />
                    </label>
                    <p className="mt-2 text-[11px] text-slate-500">JPG/PNG, rasio portrait 4 × 6, maks. 2 MB.</p>
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

                <form id="employee-administration-form" onSubmit={saveEmployee} className="scroll-mt-4 grid gap-3 sm:grid-cols-2">
                  <h3 className="text-base font-bold text-slate-800 sm:col-span-2">Biodata dan pekerjaan</h3>
                  <label className="text-sm font-medium text-slate-700">Nomor pekerja<input required className={fieldClass} value={employeeForm.employeeNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, employeeNumber: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Nama lengkap<input required className={fieldClass} value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Email<input required type="email" className={fieldClass} value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Telepon<input className={fieldClass} value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Jabatan<input required className={fieldClass} value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Departemen<input required className={fieldClass} value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Branch
                    <select required className={fieldClass} value={employeeForm.branchId} onChange={(e) => setEmployeeForm({ ...employeeForm, branchId: e.target.value })}>
                      <option value="">Pilih branch</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Status kerja
                    <select className={fieldClass} value={employeeForm.employmentStatus} onChange={(e) => setEmployeeForm({ ...employeeForm, employmentStatus: e.target.value as HrEmployeeSave['employmentStatus'] })}>
                      <option value="ACTIVE">Aktif</option><option value="ON_LEAVE">Cuti</option><option value="RESIGNED">Berakhir / resign</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Tanggal lahir<input type="date" className={fieldClass} value={employeeForm.dateOfBirth} onChange={(e) => setEmployeeForm({ ...employeeForm, dateOfBirth: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Kota kelahiran<input className={fieldClass} value={employeeForm.birthCity} onChange={(e) => setEmployeeForm({ ...employeeForm, birthCity: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">NIK<input className={fieldClass} inputMode="numeric" value={employeeForm.nik} onChange={(e) => setEmployeeForm({ ...employeeForm, nik: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">NPWP<input className={fieldClass} value={employeeForm.npwp} onChange={(e) => setEmployeeForm({ ...employeeForm, npwp: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Jenis kelamin
                    <select className={fieldClass} value={employeeForm.gender} onChange={(e) => setEmployeeForm({ ...employeeForm, gender: e.target.value as HrEmployeeSave['gender'] })}>
                      <option value="">Tidak dicatat</option><option value="MALE">Laki-laki</option><option value="FEMALE">Perempuan</option><option value="OTHER">Lainnya</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Jenis kontrak
                    <select className={fieldClass} value={employeeForm.contractType} onChange={(e) => setEmployeeForm({ ...employeeForm, contractType: e.target.value as HrEmployeeSave['contractType'] })}>
                      <option value="">Belum ditentukan</option><option value="PERMANENT">Tetap</option><option value="CONTRACT">Kontrak</option><option value="PROBATION">Probation</option><option value="INTERNSHIP">Magang</option><option value="OTHER">Lainnya</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Mulai kontrak<input type="date" className={fieldClass} value={employeeForm.contractStart} onChange={(e) => setEmployeeForm({ ...employeeForm, contractStart: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Akhir kontrak<input type="date" className={fieldClass} value={employeeForm.contractEnd} onChange={(e) => setEmployeeForm({ ...employeeForm, contractEnd: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Lama kontrak (tahun)<input type="number" min="0" max="99.9" step="0.1" className={fieldClass} value={employeeForm.contractDurationYears} onChange={(e) => setEmployeeForm({ ...employeeForm, contractDurationYears: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">No. Rekening Payroll<input className={fieldClass} inputMode="numeric" value={employeeForm.payrollAccountNumber} onChange={(e) => setEmployeeForm({ ...employeeForm, payrollAccountNumber: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Bank Payroll<input className={fieldClass} value={employeeForm.payrollBankName} onChange={(e) => setEmployeeForm({ ...employeeForm, payrollBankName: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">Alamat<textarea rows={2} className={fieldClass} value={employeeForm.address} onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Kontak darurat<input className={fieldClass} value={employeeForm.emergencyContactName} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactName: e.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-700">Telepon darurat<input className={fieldClass} value={employeeForm.emergencyContactPhone} onChange={(e) => setEmployeeForm({ ...employeeForm, emergencyContactPhone: e.target.value })} /></label>
                  <div className="sm:col-span-2">
                    <button className={buttonClass} disabled={saving || !selectedUserId}>{saving ? 'Menyimpan...' : 'Simpan data pekerja'}</button>
                    {employeeForm.employmentStatus === 'RESIGNED' && <p className="mt-2 text-xs text-amber-800">Status ini akan memblokir login pekerja, tanpa menghapus riwayat atau data akun.</p>}
                  </div>
                </form>
              </div>
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-base font-bold text-slate-900">Informasi Data Pekerja</h3>
                <p className="mt-1 text-sm text-slate-500">Ringkasan hasil entri administrasi pekerja dan akses untuk memperbarui data.</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-2 py-3">No. Pekerja</th>
                        <th className="px-2 py-3">Nama</th>
                        <th className="px-2 py-3">Jabatan</th>
                        <th className="px-2 py-3">Branch</th>
                        <th className="px-2 py-3">Kontrak</th>
                        <th className="px-2 py-3">Mulai</th>
                        <th className="px-2 py-3">Berakhir</th>
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
              <div className="mt-4 space-y-3">
                {(workspace?.leaveRequests || []).map((request) => (
                  <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold text-slate-800">{request.employeeName} · {leaveTypeLabel(request.type)} · {leaveStatusLabel(request.status)}</h3>
                      <span className="text-xs text-slate-500">{formatDateDisplay(request.startDate)} – {formatDateDisplay(request.endDate)}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-500">
                      <span>Tanggal dibuat surat: {formatDateDisplay(request.createdAt)}</span>
                      <span>Status permohonan: {leaveStatusLabel(request.status)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{request.reason}</p>
                    {request.reviewNote && <p className="mt-2 text-xs text-slate-500">Catatan HR: {request.reviewNote}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => {
                        const employee = employees.find((item) => item.userId === request.userId);
                        openLeaveLetter(request, employee || { name: request.employeeName || '-' });
                      }}>Lihat surat</button>
                      <button type="button" className={buttonClass} onClick={() => downloadLeaveLetter(
                        request,
                        employees.find((item) => item.userId === request.userId) || { name: request.employeeName || '-' },
                      )}>Download PDF</button>
                    </div>
                    {request.status === 'PENDING' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input aria-label="Catatan keputusan surat permohonan" className={`${fieldClass} max-w-md`} placeholder="Catatan wajib jika menolak" value={decisionNotes[request.id] || ''} onChange={(e) => setDecisionNotes({ ...decisionNotes, [request.id]: e.target.value })} />
                        <button className={buttonClass} disabled={saving} onClick={() => reviewLeave(request, 'APPROVED')}>Setujui</button>
                        <button className={secondaryButtonClass} disabled={saving} onClick={() => reviewLeave(request, 'REJECTED')}>Tolak</button>
                      </div>
                    )}
                  </article>
                ))}
                {!workspace?.leaveRequests.length && <p className="text-sm text-slate-500">Belum ada surat permohonan masuk.</p>}
              </div>
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
                <div data-worker-photo-frame className="aspect-[2/3] w-full max-w-[240px] overflow-hidden rounded-lg border-[3px] border-blue-700 bg-white shadow-[0_8px_22px_rgba(29,78,216,0.22)]">
                  {workerPhotoPreview
                    ? <img src={workerPhotoPreview} alt={`Foto ${profile?.name || currentUser.name}`} className="h-full w-full object-cover" />
                    : <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-400">Foto pekerja 4 × 6</div>}
                </div>
                <label className={`${secondaryButtonClass} mt-3 cursor-pointer text-center`}>
                  Ganti Foto Profil
                  <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={(event) => selectWorkerPhoto(event.target.files?.[0])} />
                </label>
                <p className="mt-2 text-center text-[11px] text-slate-500">JPG/PNG portrait 4 × 6, maks. 2 MB</p>
              </div>
            <dl className="worker-profile-details content-start text-[12px]">
              {[
                ['Nama', profile?.name || currentUser.name], ['Nomor pekerja', profile?.employeeNumber || 'Belum diisi HR'],
                ['Email', profile?.email || currentUser.email], ['Telepon', profile?.phone || currentUser.phone || '—'],
                ['Jabatan', profile?.position || currentUser.position || '—'], ['Departemen', profile?.department || currentUser.department || '—'],
                ['Branch', profile?.branchName || currentUser.branch || '—'],                 ['Tanggal lahir', formatDateDisplay(profile?.dateOfBirth)],
                ['Kota kelahiran', profile?.birthCity || '—'], ['NIK', profile?.nik || '—'], ['NPWP', profile?.npwp || '—'],
                ['Status kontrak', profile?.contractType || '—'], ['Masa kontrak', `${formatDateDisplay(profile?.contractStart)} sampai ${formatDateDisplay(profile?.contractEnd)}`],
                ['Lama kontrak (tahun)', profile?.contractDurationYears ?? '—'], ['No. Rekening Payroll', profile?.payrollAccountNumber || '—'],
                ['Bank Payroll', profile?.payrollBankName || '—'],
                ['Alamat', profile?.address || '—'], ['Kontak darurat', profile?.emergencyContactName || '—'],
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

          <section className={sectionClass}>
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
            <h2 className="text-lg font-bold text-slate-900">Surat Permohonan Ijin</h2>
            <p className="mt-1 text-sm text-slate-600">Ajukan cuti atau izin, lalu lihat dan unduh surat permohonan dalam format PDF.</p>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (leaveForm.endDate < leaveForm.startDate) {
                setError('Tanggal selesai tidak boleh mendahului tanggal mulai.');
                return;
              }
              void runMutation(async () => {
                await hrApi.requestLeave(leaveForm);
                setLeaveForm({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
              }, 'Pengajuan cuti/izin dikirim kepada HR.');
            }} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Jenis permohonan<select className={fieldClass} value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value as HrLeaveRequest['type'] })}><option value="ANNUAL">Cuti tahunan</option><option value="SICK">Sakit</option><option value="PERSONAL">Izin pribadi</option><option value="OTHER">Izin lainnya</option></select></label>
              <span />
              <label className="text-sm font-medium text-slate-700">Tanggal mulai<input required type="date" className={fieldClass} value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></label>
              <label className="text-sm font-medium text-slate-700">Tanggal selesai<input required type="date" min={leaveForm.startDate || undefined} className={fieldClass} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Alasan permohonan<textarea required rows={4} maxLength={2000} className={fieldClass} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></label>
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
              <div className="flex items-end"><button type="button" className={buttonClass} onClick={() => setWorkerPayslipShown(true)}>Tampilkan</button></div>
            </div>
            {workerPayslipShown && <div className="mt-5">
              <DocumentTable rows={workerPayslipDocuments} onDownload={downloadDocument} />
              {!workerPayslipDocuments.length && <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Belum ada slip gaji pada periode yang dipilih.</p>}
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
      <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{rows.some((row) => row.employeeName) && <th className="p-2">Pekerja</th>}<th className="p-2">Tanggal Absen</th><th className="p-2">Absen Datang</th><th className="p-2">Lembur Datang</th><th className="p-2">Absen Pulang</th><th className="p-2">Lembur Pulang</th><th className="p-2">Catatan HR</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100">
        {rows.some((item) => item.employeeName) && <td className="p-2 font-medium text-slate-800">{row.employeeName}</td>}
        <td className="p-2">{formatDateDisplay(row.date)}</td>
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
          {attendanceStatus(row).map((note) => <span key={note} className={`block ${note !== 'Hadir' && note !== 'Libur Operasional' ? 'text-red-600' : 'text-slate-700'}`}>{note}</span>)}
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
      className="relative mx-auto h-28 w-28 touch-none rounded-full transition-transform duration-150 active:scale-110 disabled:cursor-not-allowed disabled:opacity-60 sm:h-24 sm:w-24 sm:active:scale-105"
      aria-label={`${label}. Sentuh dan tahan selama dua setengah detik untuk absensi.`}
      style={{ background: `conic-gradient(#2563eb ${progress * 3.6}deg, #dbeafe 0deg)` }}
    >
      <span className="absolute inset-[6px] flex items-center justify-center rounded-full bg-white text-sm font-black text-blue-700 shadow-sm">
        {progress > 0 ? `${Math.ceil(progress)}%` : (
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 11V7" strokeLinecap="round" />
            <path d="M9.5 11V6.5a2.5 2.5 0 0 1 5 0V11" strokeLinecap="round" />
            <path d="M7.5 13v-1.5a1.5 1.5 0 0 1 3 0V13" strokeLinecap="round" />
            <path d="M13.5 11.5a1.5 1.5 0 0 1 3 0V14" strokeLinecap="round" />
            <path d="M7.5 13v2a4.5 4.5 0 0 0 9 0v-1" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
};

const leaveTypeLabel = (type: HrLeaveRequest['type']) => ({
  ANNUAL: 'Cuti tahunan',
  SICK: 'Izin sakit',
  PERSONAL: 'Izin pribadi',
  OTHER: 'Izin lainnya',
}[type]);

const leaveStatusLabel = (status: HrLeaveRequest['status']) => ({
  PENDING: 'Pending HR',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
}[status]);

const LeaveTable: React.FC<{
  rows: HrLeaveRequest[];
  employee?: { name: string; position?: string | null };
  onPreview?: (request: HrLeaveRequest) => void;
}> = ({ rows, employee, onPreview }) => (
  <div className="mt-5 space-y-2">
    {rows.map((request) => <div key={request.id} className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><b>{leaveTypeLabel(request.type)} · {leaveStatusLabel(request.status)}</b><span className="text-xs text-slate-500">{formatDateDisplay(request.startDate)} – {formatDateDisplay(request.endDate)}</span></div>
      <div className="mt-2 grid gap-1 text-xs text-slate-500">
        <span>Tanggal dibuat surat: {formatDateDisplay(request.createdAt)}</span>
        <span>Status permohonan: {leaveStatusLabel(request.status)}</span>
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
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const sourceUrl = URL.createObjectURL(blob);
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
    URL.revokeObjectURL(sourceUrl);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  }
};

const createLeaveLetterPdf = async (request: HrLeaveRequest, employee?: { name: string; position?: string | null }) => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const logoDataUrl = await imageUrlToDataUrl(getPublicLogoUrl());

  if (logoDataUrl) pdf.addImage(logoDataUrl, 'JPEG', 24, 10, 27, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('PT. LENTERA GLOBAL MARITIM', 165, 17, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text('Seamless Agent, Global Reach', 165, 23, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setFillColor(38, 99, 235);
  pdf.rect(20, 35, 170, 11, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.text('SURAT PERMOHONAN IZIN / CUTI', pageWidth / 2, 42, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text('Yang bertanda tangan di bawah ini:', 20, 64);
  pdf.text(`Nama                 : ${employee?.name || '-'}`, 20, 74);
  pdf.text(`Jabatan              : ${employee?.position || '-'}`, 20, 81);
  pdf.text(`Jenis Permohonan     : ${leaveTypeLabel(request.type)}`, 20, 88);
  pdf.text('Dengan hormat, bermaksud mengajukan permohonan izin/cuti pada:', 20, 101);
  pdf.text(`Tanggal mulai   : ${formatDateDisplay(request.startDate)}`, 20, 111);
  pdf.text(`Tanggal selesai : ${formatDateDisplay(request.endDate)}`, 20, 118);
  pdf.text('Alasan:', 20, 130);
  pdf.setFontSize(10);
  const reasonLines = pdf.splitTextToSize(request.reason, 170);
  pdf.text(reasonLines, 20, 137);

  const ySignature = 205;
  pdf.setFontSize(11);
  pdf.text(`Jakarta, ${formatDateDisplay(new Date())}`, 145, ySignature, { align: 'center' });
  pdf.text('Pemohon,', 145, ySignature + 7, { align: 'center' });
  pdf.text(employee?.name || '-', 145, ySignature + 29, { align: 'center' });

  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.3);
  pdf.line(20, 270, 190, 270);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan', pageWidth / 2, 276, { align: 'center' });
  pdf.text('Kota Adm Jakarta Selatan, DKI Jakarta - 12810', pageWidth / 2, 280, { align: 'center' });
  pdf.setTextColor(220, 38, 38);
  pdf.text('email : maritim@lentera-global.com / web : www.lentera-global.com', pageWidth / 2, 284, { align: 'center' });
  return pdf;
};

const downloadLeaveLetter = async (request: HrLeaveRequest, employee?: { name: string; position?: string | null }) => {
  (await createLeaveLetterPdf(request, employee)).save(`surat-permohonan-${request.id}.pdf`);
};

const openLeaveLetter = (request: HrLeaveRequest, employee?: { name: string; position?: string | null }) => {
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('Izinkan popup browser untuk membuka surat permohonan.');
    return;
  }

  const fileName = `surat-permohonan-${request.id}.pdf`;
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
      <iframe title="Surat Permohonan Ijin" src="${pdfData}"></iframe>
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
