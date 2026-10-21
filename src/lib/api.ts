import { AuthAccount } from '../auth';
import { AccountsReceivableEntry, BankAccount, FdaReceivableEntry, ReceivableInvoiceOption, ReceivableInvoiceType, ReceivablePaymentType, ReceivableSubjectData } from '../types';

const apiEnabled = import.meta.env.VITE_API_AUTH_ENABLED === 'true';
let csrfToken = '';

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

function toAccount(user: Record<string, unknown>): AuthAccount {
  return {
    ...user,
    branch: String(user.branch_name || user.branch || ''),
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
    return toAccount(result.user);
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
    await request<{ ok: boolean }>('auth.php?action=logout', { method: 'POST', body: '{}' });
    csrfToken = '';
  },
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await request<{ ok: boolean }>('auth.php?action=change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
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
  pph23AmountIDR: number;
  remark: string;
  idrAmount: number;
  usdAmount: number;
  exchangeRateUSDToIDR: number;
  attachmentName: string;
  attachmentDataUrl: string;
}): Promise<void> {
  if (!apiEnabled) throw new Error('Accounts Receivable memerlukan koneksi API aktif.');
  await request<{ ok: boolean }>('receivables.php', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
