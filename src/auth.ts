import { User, UserRole } from './types';

export interface AuthAccount extends User {
  username: string;
  password: string;
}

export const DEMO_ACCOUNTS: AuthAccount[] = [
  {
    id: 'USR-001', name: 'Budi Santoso', email: 'admin@maritimport.id', username: 'admin', password: 'admin123', role: 'ADMIN', department: 'IT & System Admin', branch: 'JKT', position: 'System Administrator', status: 'ACTIVE', phone: '+62 811-987-1001'
  },
  {
    id: 'USR-002', name: 'Sarah Wijaya', email: 'sarah.sales@maritimport.id', username: 'sales', password: 'sales123', role: 'SALES', department: 'Commercial & Sales', branch: 'JKT', position: 'Sales Executive', status: 'ACTIVE', phone: '+62 812-456-2002'
  },
  {
    id: 'USR-003', name: 'Capt. Hendra Pratama', email: 'hendra.ops@maritimport.id', username: 'manager', password: 'manager123', role: 'MANAGER_OPS', department: 'Marine Operations', branch: 'JKT', position: 'Manager Operations', status: 'ACTIVE', phone: '+62 813-789-3003'
  },
  {
    id: 'USR-004', name: 'Rizky Kurniawan', email: 'rizky.fda@maritimport.id', username: 'fda', password: 'fda123', role: 'FDA', department: 'Disbursement & Husbandry (FDA)', branch: 'JKT', position: 'FDA Officer', status: 'ACTIVE', phone: '+62 815-332-4004'
  },
  {
    id: 'USR-005', name: 'Dewi Lestari, SE, Ak', email: 'dewi.finance@maritimport.id', username: 'finance', password: 'finance123', role: 'FINANCE', department: 'Finance & Accounting', branch: 'JKT', position: 'Finance & Accounting', status: 'ACTIVE', phone: '+62 818-654-5005'
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  SALES: 'Sales & Commercial',
  MANAGER_OPS: 'Manager Operations',
  FDA: 'FDA & Disbursement',
  FINANCE: 'Finance & Accounting',
};

export function getStoredAccounts(): AuthAccount[] {
  try {
    const raw = localStorage.getItem('lgm_auth_accounts');
    if (!raw) return [...DEMO_ACCOUNTS];
    const stored = (JSON.parse(raw) as AuthAccount[]).filter((item): item is AuthAccount => Boolean(item && typeof item === 'object'));
    return DEMO_ACCOUNTS.map((base) => stored.find((x) => x.id === base.id) || base)
      .concat(stored.filter((x) => !DEMO_ACCOUNTS.some((b) => b.id === x.id)));
  } catch { return [...DEMO_ACCOUNTS]; }
}

export function saveStoredAccount(account: AuthAccount): void {
  const accounts = getStoredAccounts().filter((x) => x.id !== account.id);
  accounts.push(account);
  try { localStorage.setItem('lgm_auth_accounts', JSON.stringify(accounts)); } catch {}
}

export function authenticate(username: string, password: string): AuthAccount | null {
  const normalized = username.trim().toLowerCase();
  const account = getStoredAccounts().find((item) => item?.username === normalized && item.password === password && item.status === 'ACTIVE');
  return account || null;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
