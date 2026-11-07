import { AuthAccount } from '../auth';
import { AccountsReceivableEntry, AccountingAsset, AccountingBalanceSheetResponse, AccountingInboxItem, AccountingMonthlyProfitLossResponse, AccountingPostedJournalRow, AccountingProfitLossResponse, BankAccount, Branch, ChartOfAccount, FdaReceivableEntry, FinanceJournalLine, ReceivableInvoiceOption, ReceivableInvoiceType, ReceivablePaymentType, ReceivableSubjectData } from '../types';
import { androidNative } from './androidNative';

const apiEnabled = import.meta.env.VITE_API_AUTH_ENABLED === 'true';
let csrfToken = '';
const authTabSessionKey = 'lgm-authenticated-tab';

export interface PayrollSlip {
  rowNumber: number;
  employeeNumber: string;
  name: string;
  branch: string;
  position: string;
  dateJoined: string;
  dateOfBirth: string;
  bankName: string;
  bankAccountNumber: string;
  taxStatus: string;
  spouseCount: number;
  childrenCount: number;
  basicSalary: number;
  meals: number;
  transport: number;
  positionAllowance: number;
  overtime: number;
  thr: number;
  taxAllowance: number;
  totalIncomeReceived: number;
  bpjsWage: number;
  jhtEmployer: number;
  jkmEmployer: number;
  jkkEmployer: number;
  jpEmployer: number;
  bpjsEmployerTotal: number;
  bpjsHealthEmployer: number;
  employerBenefitsTotal: number;
  grossIncome: number;
  deductionBpjsTkEmployer: number;
  deductionBpjsHealthEmployer: number;
  deductionBpjsTkEmployee: number;
  deductionBpjsHealthEmployee: number;
  deductionPph21: number;
  deductionLoan: number;
  deductionAbsence: number;
  deductionThr: number;
  deductions: number;
  takeHomePay: number;
  terbilang: string;
  slipNumber: string;
  periodLabel: string;
  attendancePresent: number;
  attendanceSick: number;
  attendanceLeave: number;
  attendanceAnnualLeave: number;
  attendanceAbsent: number;
  attendanceOff: number;
}

export interface PayrollBatch {
  id: string;
  period: string;
  fileName: string;
  status: 'DRAFT' | 'FINAL';
  slipCount: number;
  createdAt: string;
}

export interface WorkerPayrollSlip {
  batchId: string;
  period: string;
  rowNumber: number;
  employeeNumber: string;
  employeeName: string;
  branch: string;
  position: string;
  dateJoined: string;
  bankName: string;
  bankAccountNumber: string;
  taxStatus: string;
  basicSalary: number;
  meals: number;
  transport: number;
  positionAllowance: number;
  overtime: number;
  thr: number;
  taxAllowance: number;
  totalIncomeReceived: number;
  bpjsWage: number;
  jhtEmployer: number;
  jkmEmployer: number;
  jkkEmployer: number;
  jpEmployer: number;
  bpjsEmployerTotal: number;
  bpjsHealthEmployer: number;
  employerBenefitsTotal: number;
  grossIncome: number;
  deductionBpjsTkEmployer: number;
  deductionBpjsHealthEmployer: number;
  deductionBpjsTkEmployee: number;
  deductionBpjsHealthEmployee: number;
  deductionPph21: number;
  deductionLoan: number;
  deductionAbsence: number;
  deductionThr: number;
  deductions: number;
  takeHomePay: number;
  terbilang: string;
  slipNumber: string;
  periodLabel: string;
  attendancePresent: number;
  attendanceSick: number;
  attendanceLeave: number;
  attendanceAnnualLeave: number;
  attendanceAbsent: number;
  attendanceOff: number;
}

interface ApiErrorPayload { error?: string; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    cache: options.method === undefined || options.method === 'GET' ? 'no-store' : options.cache,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & ApiErrorPayload;
  if (!response.ok) throw new Error(payload.error || `API request failed (${response.status})`);
  return payload;
}

export async function loadLatestUsdIdrRate(): Promise<{ rate: number; updatedAt: string }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kurs USD/IDR gagal dimuat (${response.status}).`);
    const payload = await response.json() as {
      result?: string;
      rates?: { IDR?: number };
      time_last_update_utc?: string;
    };
    const rate = Number(payload.rates?.IDR);
    if (payload.result !== 'success' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('Data kurs USD/IDR dari penyedia tidak valid.');
    }
    return { rate, updatedAt: payload.time_last_update_utc || '' };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadUsdIdrRateForDate(date: string): Promise<{ rate: number; date: string }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/${encodeURIComponent(date)}?base=USD&symbols=IDR`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kurs USD/IDR untuk ${date} gagal dimuat (${response.status}).`);
    const payload = await response.json() as { date?: string; rates?: { IDR?: number } };
    const rate = Number(payload.rates?.IDR);
    if (!payload.date || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('Data kurs USD/IDR historis tidak valid.');
    }
    return { rate, date: payload.date };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toAccount(user: Record<string, unknown>): AuthAccount {
  const rawBranchId = String(user.branch_id || user.branchId || '');
  return {
    ...user,
    branch: String(user.branch_name || user.branch || ''),
    branchId: /^\d+$/.test(rawBranchId) ? rawBranchId.padStart(3, '0') : rawBranchId,
    username: String(user.username || ''),
  } as AuthAccount;
}

export const apiAuth = {
  enabled: apiEnabled,
  getCsrfToken: () => csrfToken,
  async login(username: string, password: string): Promise<AuthAccount> {
    const result = await request<{ user: Record<string, unknown>; csrfToken: string }>('auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    csrfToken = result.csrfToken;
    sessionStorage.setItem(authTabSessionKey, 'active');
    return toAccount(result.user);
  },
  async biometricState() {
    return androidNative.biometricState();
  },
  async enableBiometric(username: string): Promise<void> {
    const key = await androidNative.prepareBiometricKey();
    const challengeResult = await request<{ challenge: { challengeId: string; signedMessage: string } }>(
      'auth.php?action=biometric-enrollment-challenge',
      { method: 'POST', body: JSON.stringify({ deviceId: key.deviceId }) },
    );
    const signature = await androidNative.signBiometricMessage(challengeResult.challenge.signedMessage);
    await request<{ ok: boolean }>('auth.php?action=biometric-enroll', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: key.deviceId,
        challengeId: challengeResult.challenge.challengeId,
        publicKey: key.publicKey,
        signature,
      }),
    });
    await androidNative.rememberBiometricAccount(username);
  },
  async loginWithBiometric(username: string, deviceId: string): Promise<AuthAccount> {
    const challengeResult = await request<{ challenge: { challengeId: string; signedMessage: string } }>(
      'auth.php?action=biometric-challenge',
      { method: 'POST', body: JSON.stringify({ username, deviceId }) },
    );
    const signature = await androidNative.signBiometricMessage(challengeResult.challenge.signedMessage);
    const result = await request<{ user: Record<string, unknown>; csrfToken: string }>(
      'auth.php?action=biometric-login',
      {
        method: 'POST',
        body: JSON.stringify({ deviceId, challengeId: challengeResult.challenge.challengeId, signature }),
      },
    );
    csrfToken = result.csrfToken;
    sessionStorage.setItem(authTabSessionKey, 'active');
    return toAccount(result.user);
  },
  async restoreSession(): Promise<AuthAccount | null> {
    const continuingTabSession = sessionStorage.getItem(authTabSessionKey) === 'active';
    const account = await this.me();
    if (!continuingTabSession && account) {
      await this.logout();
      return null;
    }
    sessionStorage.setItem(authTabSessionKey, 'active');
    return account;
  },
  async me(): Promise<AuthAccount | null> {
    try {
      const result = await request<{ user: Record<string, unknown>; csrfToken: string }>('auth.php?action=me');
      csrfToken = result.csrfToken;
      return toAccount(result.user);
    } catch (error) {
      if (error instanceof Error && error.message === 'Authentication required') return null;
      throw error;
    }
  },
  async logout(): Promise<void> {
    sessionStorage.removeItem(authTabSessionKey);
    try {
      await request<{ ok: boolean }>('auth.php?action=logout', { method: 'POST', body: '{}' });
    } finally {
      csrfToken = '';
    }
  },
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await request<{ ok: boolean }>('auth.php?action=change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
  async verifyCurrentPassword(password: string): Promise<void> {
    await request<{ ok: boolean }>('auth.php?action=verify-current-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
};

export interface PdaDraftItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  price: number;
  remarks: string;
  vatApplied: boolean;
}

export interface ContinuedPdaItemReference {
  sourceItemId: string;
  fpdaItemId: string;
}

export type PdaDocumentType = 'SALES' | 'FDA';

export interface PdaDraft {
  jobId: string;
  pdaType: PdaDocumentType;
  pdaNo: string;
  createdAt: string;
  salesPdaNo?: string | null;
  salesPdaCurrency?: 'IDR' | 'USD' | null;
  salesPdaItems?: PdaDraftItem[];
  approvalStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUIRED';
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  currency: 'IDR' | 'USD';
  exchangeRate: number;
  eta: string;
  etd: string;
  etaRemarks: string;
  etdRemarks: string;
  itemDraft: {
    name: string;
    category: string;
    price: number;
    quantity: number;
    unit: string;
    remarks: string;
    vatApplied: boolean;
    pph23Applied?: boolean;
    globalVatApplied?: boolean;
    discountAmount?: number;
    continuedPdaItems?: ContinuedPdaItemReference[];
  };
  revision: number;
  items: PdaDraftItem[];
}

export async function openPdaDraft(
  jobId: string,
  defaults: Omit<PdaDraft, 'jobId' | 'pdaType' | 'pdaNo' | 'createdAt' | 'approvalStatus' | 'submittedBy' | 'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes' | 'revision' | 'items' | 'itemDraft'>,
  pdaType: PdaDocumentType = 'SALES',
): Promise<PdaDraft> {
  if (!apiEnabled) throw new Error('Penyimpanan PDA memerlukan koneksi API aktif.');
  const result = await request<{ draft: PdaDraft }>('pda.php?action=open', {
    method: 'POST',
    body: JSON.stringify({ jobId, defaults, pdaType }),
  });
  return result.draft;
}

export async function savePdaDraft(
  jobId: string,
  draft: Omit<PdaDraft, 'jobId' | 'createdAt' | 'approvalStatus' | 'submittedBy' | 'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes'>,
): Promise<number> {
  if (!apiEnabled) throw new Error('Penyimpanan PDA memerlukan koneksi API aktif.');
  const result = await request<{ revision: number }>('pda.php?action=save', {
    method: 'PUT',
    body: JSON.stringify({ jobId, pdaType: draft.pdaType, draft }),
  });
  return result.revision;
}

export async function submitPdaDraft(jobId: string, revision: number, pdaType: PdaDocumentType = 'SALES'): Promise<number> {
  if (!apiEnabled) throw new Error('Pengajuan PDA memerlukan koneksi API aktif.');
  const result = await request<{ revision: number; status: 'SUBMITTED' }>('pda.php?action=submit', {
    method: 'POST',
    body: JSON.stringify({ jobId, revision, pdaType }),
  });
  return result.revision;
}

export async function loadPdaServiceItemHistory(pdaType: PdaDocumentType = 'SALES'): Promise<string[]> {
  if (!apiEnabled) throw new Error('Riwayat item PDA memerlukan koneksi API aktif.');
  const result = await request<{ items: string[] }>(`pda.php?action=service-item-history&pdaType=${pdaType}`);
  return result.items;
}

export async function listPendingPdaDrafts(): Promise<PdaDraft[]> {
  if (!apiEnabled) throw new Error('Approval PDA memerlukan koneksi API aktif.');
  const result = await request<{ drafts: PdaDraft[] }>('pda.php?action=pending');
  return result.drafts;
}

export async function listPdaRevisionDrafts(): Promise<PdaDraft[]> {
  if (!apiEnabled) throw new Error('Status revisi PDA memerlukan koneksi API aktif.');
  const result = await request<{ drafts: PdaDraft[] }>('pda.php?action=revisions');
  return result.drafts;
}

export async function listApprovedPdaJobIds(): Promise<string[]> {
  if (!apiEnabled) throw new Error('Status PDA memerlukan koneksi API aktif.');
  const result = await request<{ jobIds: string[] }>('pda.php?action=approved');
  return result.jobIds;
}

export interface ApprovedSalesPdaTotal {
  jobId: string;
  currency: 'IDR' | 'USD';
  exchangeRate: number;
  total: number;
  pdaNo?: string;
}

export async function listApprovedSalesPdaTotals(): Promise<ApprovedSalesPdaTotal[]> {
  if (!apiEnabled) return [];
  const result = await request<{ totals: ApprovedSalesPdaTotal[] }>('pda.php?action=approved-totals');
  return result.totals;
}

export async function listApprovedFdaPdaTotals(): Promise<ApprovedSalesPdaTotal[]> {
  if (!apiEnabled) return [];
  const result = await request<{ totals: ApprovedSalesPdaTotal[] }>('pda.php?action=approved-fda-totals');
  return result.totals;
}

export async function listFpdaNumbers(): Promise<{ jobId: string; fpdaNo: string }[]> {
  if (!apiEnabled) return [];
  const result = await request<{ numbers: { jobId: string; fpdaNo: string }[] }>('pda.php?action=fpda-numbers');
  return result.numbers;
}

export async function getApprovedPdaDraft(jobId: string): Promise<PdaDraft> {
  if (!apiEnabled) throw new Error('PDA approved memerlukan koneksi API aktif.');
  const result = await request<{ draft: PdaDraft }>(`pda.php?action=view-approved&jobId=${encodeURIComponent(jobId)}`);
  return result.draft;
}

export async function getManagerPdaDraft(jobId: string, pdaType: PdaDocumentType): Promise<PdaDraft | null> {
  if (!apiEnabled) throw new Error('PDA preview memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'manager-view', jobId, pdaType });
  const result = await request<{ draft: PdaDraft | null }>(`pda.php?${query.toString()}`);
  return result.draft;
}

export async function reviewPdaDraft(
  jobId: string,
  decision: 'APPROVED' | 'REVISION_REQUIRED',
  notes: string,
  pdaType: PdaDocumentType = 'SALES',
): Promise<void> {
  if (!apiEnabled) throw new Error('Approval PDA memerlukan koneksi API aktif.');
  await request<{ status: 'APPROVED' | 'REVISION_REQUIRED' }>('pda.php?action=review', {
    method: 'POST',
    body: JSON.stringify({ jobId, decision, notes, pdaType }),
  });
}

export async function loadAccountsReceivableOptions(): Promise<{ invoiceOptions: ReceivableInvoiceOption[]; bankAccounts: BankAccount[] }> {
  if (!apiEnabled) throw new Error('Accounts Receivable memerlukan koneksi API aktif.');
  return request<{ invoiceOptions: ReceivableInvoiceOption[]; bankAccounts: BankAccount[] }>('receivables.php?action=options');
}

export async function loadAccountsReceivableHistory(): Promise<AccountsReceivableEntry[]> {
  if (!apiEnabled) throw new Error('Accounts Receivable memerlukan koneksi API aktif.');
  const result = await request<{ entries: AccountsReceivableEntry[] }>('receivables.php?action=history');
  return result.entries;
}

export async function loadAccountingFinanceReceivableHistory(branchId = ''): Promise<AccountsReceivableEntry[]> {
  if (!apiEnabled) throw new Error('History Keuangan memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'accounting-history' });
  if (branchId) query.set('branchId', branchId);
  const result = await request<{ entries: AccountsReceivableEntry[] }>(`receivables.php?${query.toString()}`);
  return result.entries;
}

export async function loadFdaReceivableEntries(jobId?: string): Promise<FdaReceivableEntry[]> {
  if (!apiEnabled) throw new Error('Riwayat penerimaan Finance memerlukan koneksi API aktif.');
  const params = new URLSearchParams({ action: 'fda-advance-history' });
  if (jobId) params.set('jobId', jobId);
  const result = await request<{ entries: FdaReceivableEntry[] }>(`receivables.php?${params.toString()}`);
  return result.entries;
}

export async function createAccountsReceivableEntry(entry: {
  subjectData: ReceivableSubjectData;
  paymentType: ReceivablePaymentType;
  jobId?: string;
  invoiceType?: ReceivableInvoiceType;
  invoiceNo?: string;
  incomeDate: string;
  bankAccountId: string;
  remark: string;
  idrAmount: number;
  usdAmount: number;
  exchangeRateUSDToIDR: number;
  attachmentName: string;
  attachmentDataUrl: string;
}): Promise<string> {
  if (!apiEnabled) throw new Error('Accounts Receivable memerlukan koneksi API aktif.');
  const result = await request<{ ok: boolean; receiptNumber: string }>('receivables.php', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return result.receiptNumber;
}

export async function loadAccountingInbox(): Promise<{ items: AccountingInboxItem[]; accounts: ChartOfAccount[] }> {
  if (!apiEnabled) throw new Error('Accounting memerlukan koneksi API aktif.');
  return request<{ items: AccountingInboxItem[]; accounts: ChartOfAccount[] }>('accounting.php?action=inbox');
}

export async function saveAccountingJournal(input: {
  sourceType: AccountingInboxItem['sourceType'];
  sourceKey: string;
  entryDate: string;
  description: string;
  lines: FinanceJournalLine[];
}, post: boolean): Promise<{ journalId: string; journalNumber: string | null; status: 'DRAFT' | 'POSTED' }> {
  if (!apiEnabled) throw new Error('Accounting memerlukan koneksi API aktif.');
  return request<{ journalId: string; journalNumber: string | null; status: 'DRAFT' | 'POSTED' }>(
    `accounting.php?action=${post ? 'post' : 'draft'}`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function loadAccountingPostedJournalReport(startDate: string, endDate: string, scope: 'ALL' | 'HISTORICAL' | 'BRANCH' = 'ALL', branchId = ''): Promise<AccountingPostedJournalRow[]> {
  if (!apiEnabled) throw new Error('Accounting memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'posted-report', scope });
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (branchId) query.set('branchId', branchId);
  const result = await request<{ rows: AccountingPostedJournalRow[] }>(`accounting.php?${query.toString()}`);
  return result.rows;
}

export async function loadAccountingChartOfAccounts(): Promise<ChartOfAccount[]> {
  if (!apiEnabled) throw new Error('Accounting memerlukan koneksi API aktif.');
  const result = await request<{ accounts: ChartOfAccount[] }>('accounting.php?action=chart-of-accounts');
  return result.accounts;
}

export async function updateAccountingPostedJournal(input: {
  journalId: string;
  journalDate: string;
  lines: Array<{
    id: string;
    coaId: string;
    memo: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    overrides: {
      arApNumber: string;
      appliedDate: string;
      shipment: string;
      customer: string;
      jobVessel: string;
      refNoFda: string;
      bl: string;
      currency: string;
      exchangeRate: number;
      item: string;
      vendor: string;
    };
  }>;
}): Promise<void> {
  if (!apiEnabled) throw new Error('Accounting memerlukan koneksi API aktif.');
  await request<{ ok: boolean }>('accounting.php?action=edit-posted', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loadAccountingBalanceSheet(asOf: string, scope: 'ALL' | 'HISTORICAL' | 'BRANCH' = 'ALL', branchId = ''): Promise<AccountingBalanceSheetResponse> {
  if (!apiEnabled) throw new Error('Neraca memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'balance-sheet', asOf, scope });
  if (branchId) query.set('branchId', branchId);
  return request<AccountingBalanceSheetResponse>(`accounting.php?${query.toString()}`);
}

export async function loadAccountingProfitLoss(startDate: string, endDate: string, scope: 'ALL' | 'HISTORICAL' | 'BRANCH' = 'ALL', branchId = ''): Promise<AccountingProfitLossResponse> {
  if (!apiEnabled) throw new Error('Laba Rugi memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'profit-loss', startDate, endDate, scope });
  if (branchId) query.set('branchId', branchId);
  return request<AccountingProfitLossResponse>(`accounting.php?${query.toString()}`);
}

export async function loadAccountingMonthlyProfitLoss(year: number, scope: 'ALL' | 'HISTORICAL' | 'BRANCH' = 'ALL', branchId = ''): Promise<AccountingMonthlyProfitLossResponse> {
  if (!apiEnabled) throw new Error('Rincian Laba memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'profit-loss-monthly', year: String(year), scope });
  if (branchId) query.set('branchId', branchId);
  return request<AccountingMonthlyProfitLossResponse>(`accounting.php?${query.toString()}`);
}

export async function loadAccountingAssets(): Promise<{
  assets: AccountingAsset[];
  branches: Branch[];
  accounts: ChartOfAccount[];
}> {
  if (!apiEnabled) throw new Error('Accounting Assets memerlukan koneksi API aktif.');
  return request<{ assets: AccountingAsset[]; branches: Branch[]; accounts: ChartOfAccount[] }>('accounting_assets.php?action=list');
}

export async function createAccountingAsset(input: {
  assetCode: string;
  assetName: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  residualValue: number;
  location: string;
  branchId: string;
  status: AccountingAsset['status'];
  coaAssetId: string;
  coaDepreciationId: string;
}): Promise<{ id: string }> {
  if (!apiEnabled) throw new Error('Accounting Assets memerlukan koneksi API aktif.');
  return request<{ id: string }>('accounting_assets.php?action=create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAccountingAsset(assetId: string, input: {
  assetCode: string;
  assetName: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  residualValue: number;
  location: string;
  branchId: string;
  status: AccountingAsset['status'];
  coaAssetId: string;
  coaDepreciationId: string;
}): Promise<{ id: string }> {
  if (!apiEnabled) throw new Error('Accounting Assets memerlukan koneksi API aktif.');
  const query = new URLSearchParams({ action: 'update', assetId });
  return request<{ id: string }>(`accounting_assets.php?${query.toString()}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type HrEmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED';
export type HrLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface HrEmployee {
  userId: string;
  employeeNumber: string | null;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: string | null;
  branchName: string | null;
  branchId: string | number | null;
  dateOfBirth: string | null;
  birthCity: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  employmentStatus: HrEmploymentStatus;
  contractType: 'PERMANENT' | 'CONTRACT' | 'PROBATION' | 'INTERNSHIP' | 'OTHER' | null;
  contractStart: string | null;
  contractEnd: string | null;
  contractDurationYears: number | null;
  nik: string | null;
  npwp: string | null;
  bpjsKetenagakerjaan: string | null;
  bpjsKesehatan: string | null;
  payrollAccountNumber: string | null;
  payrollBankName: string | null;
  hasRecord: boolean;
  photoDataBase64: string | null;
  photoMimeType: string | null;
}

export interface HrDocument {
  id: string;
  userId?: string;
  employeeName?: string;
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}

export interface HrAttendance {
  id: string;
  userId?: string;
  employeeName?: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'REMOTE' | 'LEAVE';
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
  updatedByName?: string;
  updatedAt: string;
  checkInAt?: string | null;
  checkInLatitude?: number | string | null;
  checkInLongitude?: number | string | null;
  checkInAccuracyMeters?: number | string | null;
  overtimeCheckInAt?: string | null;
  overtimeCheckInLatitude?: number | string | null;
  overtimeCheckInLongitude?: number | string | null;
  overtimeCheckInAccuracyMeters?: number | string | null;
  checkOutAt?: string | null;
  checkOutLatitude?: number | string | null;
  checkOutLongitude?: number | string | null;
  checkOutAccuracyMeters?: number | string | null;
  overtimeCheckOutAt?: string | null;
  overtimeCheckOutLatitude?: number | string | null;
  overtimeCheckOutLongitude?: number | string | null;
  overtimeCheckOutAccuracyMeters?: number | string | null;
}

export interface HrAttendanceReportRow {
  date: string;
  employeeName: string;
  employeeNumber?: string | null;
  userId: string;
  branchName: string | null;
  position?: string | null;
  department?: string | null;
  status?: 'PRESENT' | 'ABSENT' | 'REMOTE' | 'LEAVE' | null;
  leaveType?: 'ANNUAL' | 'SICK' | 'PERSONAL' | 'OTHER' | null;
  checkInAt: string | null;
  checkInLatitude: number | string | null;
  checkInLongitude: number | string | null;
  checkInAccuracyMeters: number | string | null;
  overtimeCheckInAt: string | null;
  overtimeCheckInLatitude: number | string | null;
  overtimeCheckInLongitude: number | string | null;
  overtimeCheckInAccuracyMeters: number | string | null;
  checkOutAt: string | null;
  checkOutLatitude: number | string | null;
  checkOutLongitude: number | string | null;
  checkOutAccuracyMeters: number | string | null;
  overtimeCheckOutAt: string | null;
  overtimeCheckOutLatitude: number | string | null;
  overtimeCheckOutLongitude: number | string | null;
  overtimeCheckOutAccuracyMeters: number | string | null;
}

export type HrAttendanceEvent = 'CHECK_IN' | 'OVERTIME_CHECK_IN' | 'CHECK_OUT' | 'OVERTIME_CHECK_OUT';

export interface HrLeaveRequest {
  id: string;
  userId?: string;
  employeeName?: string;
  type: 'ANNUAL' | 'BUSINESS_TRAVEL' | 'SICK' | 'PERSONAL' | 'OTHER';
  startDate: string;
  endDate: string;
  durationDays: number | null;
  destinationCity: string | null;
  transportMode: 'CAR' | 'PLANE' | 'TRAIN' | 'PUBLIC_BUS' | null;
  reason: string;
  status: HrLeaveStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
}

export interface HrLeaveVerification {
  id: string;
  type: HrLeaveRequest['type'];
  startDate: string;
  endDate: string;
  submittedAt: string;
  status: HrLeaveStatus;
  employeeName: string;
}

export interface HrProfileChangeRequest {
  id: string;
  userId?: string;
  employeeName?: string;
  proposedData: Record<string, string | null>;
  status: HrLeaveStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
}

export interface HrHistoryEntry {
  id: string;
  userId: string;
  employeeName: string | null;
  eventType: string;
  summary: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  actorName: string;
  createdAt: string;
  createdAtWib?: string;
}

export interface HrWorkspace {
  employees?: HrEmployee[];
  profile?: HrEmployee | null;
  documents: HrDocument[];
  attendance: HrAttendance[];
  leaveRequests: HrLeaveRequest[];
  profileRequests: HrProfileChangeRequest[];
  history?: HrHistoryEntry[];
  branches?: Branch[];
}

export interface HrEmployeeSave {
  userId: string;
  employeeNumber: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  branchId: string;
  dateOfBirth: string;
  birthCity: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  photoDataBase64?: string;
  photoMimeType?: string;
  employmentStatus: HrEmploymentStatus;
  contractType: '' | 'PERMANENT' | 'CONTRACT' | 'PROBATION' | 'INTERNSHIP' | 'OTHER';
  contractStart: string;
  contractEnd: string;
  contractDurationYears: string;
  nik: string;
  npwp: string;
  bpjsKetenagakerjaan: string;
  bpjsKesehatan: string;
  payrollAccountNumber: string;
  payrollBankName: string;
}

export const hrApi = {
  async verifyLeaveRequest(id: string): Promise<HrLeaveVerification> {
    const query = new URLSearchParams({ action: 'verify-leave', id });
    const result = await request<{ verification: HrLeaveVerification }>(`hr.php?${query.toString()}`);
    return result.verification;
  },
  async loadWorkspace(): Promise<HrWorkspace> {
    if (!apiEnabled) throw new Error('Workspace HR memerlukan koneksi API aktif.');
    return request<HrWorkspace>('hr.php?action=workspace');
  },
  async saveEmployee(input: HrEmployeeSave): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=save-employee', { method: 'POST', body: JSON.stringify(input) });
  },
  async uploadDocument(input: { userId: string; title: string; category: string; file: File }): Promise<void> {
    if (!apiEnabled) throw new Error('Upload dokumen memerlukan koneksi API aktif.');
    const form = new FormData();
    form.set('userId', input.userId);
    form.set('title', input.title);
    form.set('category', input.category);
    form.set('document', input.file);
    const response = await fetch('/api/hr.php?action=upload-document', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
      body: form,
    });
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
    if (!response.ok) throw new Error(payload.error || `Dokumen gagal diunggah (${response.status}).`);
  },
  async downloadDocument(id: string): Promise<{ fileName: string; mimeType: string; contentBase64: string }> {
    const query = new URLSearchParams({ action: 'document', id });
    return request<{ fileName: string; mimeType: string; contentBase64: string }>(`hr.php?${query.toString()}`);
  },
  async saveAttendance(input: {
    userId: string;
    date: string;
    status: HrAttendance['status'];
    checkIn: string;
    checkOut: string;
    note: string;
  }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=save-attendance', { method: 'POST', body: JSON.stringify(input) });
  },
  async saveAttendanceEdit(input: {
    userId: string;
    date: string;
    checkIn: string;
    overtimeCheckIn: string;
    checkOut: string;
    overtimeCheckOut: string;
  }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=save-attendance-edit', { method: 'POST', body: JSON.stringify(input) });
  },
  async attendanceReport(input: {
    year: number;
    month: number;
    category: 'ALL' | 'BRANCH' | 'EMPLOYEE';
    branchId?: string;
    name?: string;
    date?: string;
    filterMode?: 'TODAY' | 'CUSTOM_DATE' | 'MONTH' | 'YEAR';
  }): Promise<HrAttendanceReportRow[]> {
    const query = new URLSearchParams({
      action: 'attendance-report',
      year: String(input.year),
      month: String(input.month),
      category: input.category,
    });
    if (input.branchId) query.set('branchId', input.branchId);
    if (input.name) query.set('name', input.name);
    if (input.date) query.set('date', input.date);
    if (input.filterMode) query.set('filterMode', input.filterMode);
    const result = await request<{ rows: HrAttendanceReportRow[] }>(`hr.php?${query.toString()}`);
    return result.rows;
  },
  async punchAttendance(input: {
    event: HrAttendanceEvent;
    latitude: number;
    longitude: number;
    accuracy: number;
  }): Promise<{ ok: boolean; event: HrAttendanceEvent; occurredAt: string }> {
    return request<{ ok: boolean; event: HrAttendanceEvent; occurredAt: string }>('hr.php?action=punch-attendance', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async requestLeave(input: {
    type: HrLeaveRequest['type'];
    startDate: string;
    endDate: string;
    destinationCity: string;
    transportMode: NonNullable<HrLeaveRequest['transportMode']> | '';
    reason: string;
  }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=request-leave', { method: 'POST', body: JSON.stringify(input) });
  },
  async reviewLeave(input: { id: string; decision: 'APPROVED' | 'REJECTED'; note: string }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=review-leave', { method: 'POST', body: JSON.stringify(input) });
  },
  async requestProfileChange(changes: Record<string, string>): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=request-profile-change', { method: 'POST', body: JSON.stringify({ changes }) });
  },
  async updateWorkerPhoto(input: { photoDataBase64: string; photoMimeType: string }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=update-worker-photo', { method: 'POST', body: JSON.stringify(input) });
  },
  async reviewProfileChange(input: { id: string; decision: 'APPROVED' | 'REJECTED'; note: string }): Promise<void> {
    await request<{ ok: boolean }>('hr.php?action=review-profile-change', { method: 'POST', body: JSON.stringify(input) });
  },
};

export async function listPayrollBatches(): Promise<PayrollBatch[]> {
  const result = await request<{ batches: PayrollBatch[] }>('payroll.php');
  return result.batches;
}

export async function savePayrollBatch(input: {
  period: string;
  fileName: string;
  status: 'DRAFT' | 'FINAL';
  rows: PayrollSlip[];
}): Promise<PayrollBatch> {
  const result = await request<{ batch: PayrollBatch }>('payroll.php', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.batch;
}

export async function deletePayrollPeriod(period: string, confirmPeriod: string): Promise<{ deletedSlipCount: number }> {
  return request<{ ok: boolean; period: string; deletedSlipCount: number }>('payroll.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete-period', period, confirmPeriod }),
  });
}

export async function listWorkerPayrollSlips(period: string): Promise<WorkerPayrollSlip[]> {
  const query = new URLSearchParams({ period });
  const result = await request<{ slips: WorkerPayrollSlip[] }>(`payroll.php?${query.toString()}`);
  return result.slips;
}
