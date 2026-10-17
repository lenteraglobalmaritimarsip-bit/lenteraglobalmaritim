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

export interface PdaDraft {
  pdaNo: string;
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

export async function openPdaDraft(jobId: string, defaults: Omit<PdaDraft, 'pdaNo' | 'revision' | 'items' | 'itemDraft'>): Promise<PdaDraft> {
  if (!apiEnabled) throw new Error('Penyimpanan PDA memerlukan koneksi API aktif.');
  const result = await request<{ draft: PdaDraft }>('pda.php?action=open', {
    method: 'POST',
    body: JSON.stringify({ jobId, defaults }),
  });
  return result.draft;
}

export async function savePdaDraft(jobId: string, draft: PdaDraft): Promise<number> {
  if (!apiEnabled) throw new Error('Penyimpanan PDA memerlukan koneksi API aktif.');
  const result = await request<{ revision: number }>('pda.php?action=save', {
    method: 'PUT',
    body: JSON.stringify({ jobId, draft }),
  });
  return result.revision;
}
