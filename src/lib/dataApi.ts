import { DatabaseState } from '../types';
import { apiAuth } from './api';

export const dataApi = {
  async load(): Promise<{ state: DatabaseState; initialized: boolean }> {
    const response = await fetch('/api/state.php', { credentials: 'include' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `State request failed (${response.status})`);
    return payload as { state: DatabaseState; initialized: boolean };
  },
  async save(state: DatabaseState): Promise<void> {
    const response = await fetch('/api/state.php', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': apiAuth.getCsrfToken(),
      },
      body: JSON.stringify({ state }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; details?: string };
    if (!response.ok) throw new Error([payload.error, payload.details].filter(Boolean).join(': ') || `State save failed (${response.status})`);
  },
};
