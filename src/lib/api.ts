import { AuthAccount } from '../auth';

const apiEnabled = import.meta.env.VITE_API_AUTH_ENABLED === 'true';
let csrfToken = '';

interface ApiErrorPayload { error?: string; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
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

export type PdaDocumentType = 'SALES' | 'FDA';

export interface PdaDraft {
  jobId: string;
  pdaType: PdaDocumentType;
  pdaNo: string;
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
  };
  revision: number;
  items: PdaDraftItem[];
}

export async function openPdaDraft(
  jobId: string,
  defaults: Omit<PdaDraft, 'jobId' | 'pdaType' | 'pdaNo' | 'approvalStatus' | 'submittedBy' | 'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes' | 'revision' | 'items' | 'itemDraft'>,
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
  draft: Omit<PdaDraft, 'jobId' | 'approvalStatus' | 'submittedBy' | 'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes'>,
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

export async function listPendingPdaDrafts(): Promise<PdaDraft[]> {
  if (!apiEnabled) throw new Error('Approval PDA memerlukan koneksi API aktif.');
  const result = await request<{ drafts: PdaDraft[] }>('pda.php?action=pending');
  return result.drafts;
}

export async function listApprovedPdaJobIds(): Promise<string[]> {
  if (!apiEnabled) throw new Error('Status PDA memerlukan koneksi API aktif.');
  const result = await request<{ jobIds: string[] }>('pda.php?action=approved');
  return result.jobIds;
}

export async function getApprovedPdaDraft(jobId: string): Promise<PdaDraft> {
  if (!apiEnabled) throw new Error('PDA approved memerlukan koneksi API aktif.');
  const result = await request<{ draft: PdaDraft }>(`pda.php?action=view-approved&jobId=${encodeURIComponent(jobId)}`);
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
