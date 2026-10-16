import { User, UserRole } from './types';

export interface AuthAccount extends User {
  username: string;
  password?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  SALES: 'Sales & Commercial',
  MANAGER_OPS: 'Manager Operations',
  FDA: 'FDA & Disbursement',
  FINANCE: 'Finance & Accounting',
};

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
