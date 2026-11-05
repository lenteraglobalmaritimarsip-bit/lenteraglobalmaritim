import { Branch } from './types';

export const INITIAL_BRANCHES: Branch[] = [
  { id: '001', code: 'JKT', name: 'Jakarta', isActive: true },
  { id: '002', code: 'BJM', name: 'Banjarmasin', isActive: true },
  { id: '003', code: 'SBY', name: 'Surabaya', isActive: true },
  { id: '004', code: 'MKS', name: 'Makassar', isActive: true },
  { id: '005', code: 'SRG', name: 'Semarang', isActive: true },
  { id: '006', code: 'BTM', name: 'Batam', isActive: true },
];

export const getBranchById = (branchId?: string): Branch | undefined =>
  INITIAL_BRANCHES.find((branch) => branch.id === branchId);

export const getBranchByValue = (value?: string, branches: Branch[] = INITIAL_BRANCHES): Branch | undefined => {
  const normalizedValue = (value || '').trim().toLocaleLowerCase();
  if (!normalizedValue) return undefined;
  return branches.find((branch) =>
    branch.id.toLocaleLowerCase() === normalizedValue
    || branch.code.toLocaleLowerCase() === normalizedValue
    || branch.name.toLocaleLowerCase() === normalizedValue,
  );
};
