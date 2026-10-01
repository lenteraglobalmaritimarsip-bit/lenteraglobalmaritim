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
    branch: String(user.branch_code || user.branch_name || ''),
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
