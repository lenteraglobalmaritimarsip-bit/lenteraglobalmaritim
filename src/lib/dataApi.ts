import { DatabaseState } from '../types';
import { apiAuth } from './api';

export type AppUserDataKey = 'voucher_draft' | 'finance_payment_draft' | 'notification_reads';

export const dataApi = {
  async load(): Promise<{ state: DatabaseState; initialized: boolean; revision: string }> {
    const response = await fetch('/api/state.php', { credentials: 'include' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `State request failed (${response.status})`);
    return payload as { state: DatabaseState; initialized: boolean; revision: string };
  },
  async save(state: DatabaseState, revision: string): Promise<string> {
    const response = await fetch('/api/state.php', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': apiAuth.getCsrfToken(),
      },
      body: JSON.stringify({ state, revision }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; details?: string; revision?: string };
    if (!response.ok) throw new Error([payload.error, payload.details].filter(Boolean).join(': ') || `State save failed (${response.status})`);
    if (!payload.revision) throw new Error('State save response did not include a revision');
    return payload.revision;
  },
  async getUserData<T>(key: AppUserDataKey): Promise<T | null> {
    const response = await fetch(`/api/user_data.php?key=${encodeURIComponent(key)}`, { credentials: 'include' });
    const payload = await response.json() as { value: T | null; error?: string };
    if (!response.ok) throw new Error(payload.error || `User data request failed (${response.status})`);
    return payload.value;
  },
  async saveUserData<T>(key: AppUserDataKey, value: T): Promise<void> {
    const response = await fetch('/api/user_data.php', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': apiAuth.getCsrfToken(),
      },
      body: JSON.stringify({ key, value }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `User data save failed (${response.status})`);
  },
  async deleteUserData(key: AppUserDataKey): Promise<void> {
    const response = await fetch(`/api/user_data.php?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': apiAuth.getCsrfToken() },
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `User data deletion failed (${response.status})`);
  },
};
