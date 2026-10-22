import { ExpensesItem, FixTariff } from '../types';

const normalized = (value?: string) => (value || '').trim().toLowerCase();

const samePort = (first: { portId?: string; portName?: string }, second: { portId?: string; portName?: string }) =>
  (!!first.portId && !!second.portId && first.portId === second.portId)
  || (!!first.portName && !!second.portName && normalized(first.portName) === normalized(second.portName));

const normalizedTariffType = (tariff: Pick<FixTariff, 'tariffType' | 'calculationBasis'>) => {
  const type = tariff.tariffType || (tariff.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
  return type;
};

export const findMatchingFixTariff = (
  tariffs: FixTariff[],
  candidate: Pick<FixTariff, 'portId' | 'portName' | 'serviceName' | 'costCategory' | 'grtMin' | 'grtMax' | 'dwt' | 'tariffType' | 'calculationBasis'>,
) => tariffs.find((tariff) =>
  samePort(tariff, candidate)
  && normalized(tariff.serviceName) === normalized(candidate.serviceName)
  && normalized(tariff.costCategory || 'PORT_EXPENSES') === normalized(candidate.costCategory || 'PORT_EXPENSES')
  && Number(tariff.grtMin ?? 0) === Number(candidate.grtMin ?? 0)
  && Number(tariff.grtMax ?? 0) === Number(candidate.grtMax ?? 0)
  && Number(tariff.dwt ?? 0) === Number(candidate.dwt ?? 0)
  && normalizedTariffType(tariff) === normalizedTariffType(candidate)
);

export const findMatchingExpensesItem = (
  items: ExpensesItem[],
  candidate: Pick<ExpensesItem, 'portId' | 'portName' | 'name' | 'category' | 'calculationType'>,
) => items.find((item) =>
  samePort(item, candidate)
  && normalized(item.name) === normalized(candidate.name)
  && normalized(item.category) === normalized(candidate.category)
  && (item.calculationType || '') === (candidate.calculationType || '')
);

export const fixTariffRatePatch = (
  existing: FixTariff,
  incoming: Omit<FixTariff, 'id'>,
  updateRateIDR = true,
  updateRateUSD = true,
): Partial<FixTariff> => {
  return {
    ...(updateRateIDR ? { rateIDR: incoming.rateIDR } : { rateIDR: existing.rateIDR }),
    ...(updateRateUSD ? { rateUSD: incoming.rateUSD } : { rateUSD: existing.rateUSD }),
  };
};

export const expensesItemRatePatch = (existing: ExpensesItem, incoming: Omit<ExpensesItem, 'id'>): Partial<ExpensesItem> => {
  return {
    rateIDR: Number(incoming.rateIDR) > 0 ? incoming.rateIDR : existing.rateIDR,
    rateUSD: Number(incoming.rateUSD) > 0 ? incoming.rateUSD : existing.rateUSD,
    remarks: incoming.remarks ?? existing.remarks,
  };
};