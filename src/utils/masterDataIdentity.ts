import { ExpensesItem, FixTariff } from '../types';

const normalized = (value?: string) => (value || '').trim().toLowerCase();

const samePort = (first: { portId?: string; portName?: string }, second: { portId?: string; portName?: string }) =>
  (!!first.portId && !!second.portId && first.portId === second.portId)
  || (!!first.portName && !!second.portName && normalized(first.portName) === normalized(second.portName));

const normalizedTariffType = (tariff: Pick<FixTariff, 'tariffType' | 'calculationBasis'>) => {
  const type = tariff.tariffType || (tariff.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
  return type === 'RANGE' ? 'QTY_CARGO' : type;
};

export const findMatchingFixTariff = (
  tariffs: FixTariff[],
  candidate: Pick<FixTariff, 'portId' | 'portName' | 'serviceName' | 'costCategory' | 'grt' | 'grtMin' | 'grtMax' | 'dwt' | 'tariffType' | 'calculationBasis'>,
) => tariffs.find((tariff) =>
  samePort(tariff, candidate)
  && normalized(tariff.serviceName) === normalized(candidate.serviceName)
  && normalized(tariff.costCategory || 'PORT_EXPENSES') === normalized(candidate.costCategory || 'PORT_EXPENSES')
  && Number(tariff.grtMin ?? tariff.grt ?? 0) === Number(candidate.grtMin ?? candidate.grt ?? 0)
  && Number(tariff.grtMax ?? tariff.grt ?? 0) === Number(candidate.grtMax ?? candidate.grt ?? 0)
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
  && (item.calculationType === 'RANGE' ? 'QTY_CARGO' : item.calculationType || '')
    === (candidate.calculationType === 'RANGE' ? 'QTY_CARGO' : candidate.calculationType || '')
);

export const fixTariffRatePatch = (existing: FixTariff, incoming: Omit<FixTariff, 'id'>): Partial<FixTariff> => {
  const legacyIDR = existing.currency === 'IDR' ? existing.rate : 0;
  const legacyUSD = existing.currency === 'USD' ? existing.rate : 0;
  const incomingIDR = Number(incoming.rateIDR) > 0
    ? Number(incoming.rateIDR)
    : incoming.currency === 'IDR' ? Number(incoming.rate) || 0 : 0;
  const incomingUSD = Number(incoming.rateUSD) > 0
    ? Number(incoming.rateUSD)
    : incoming.currency === 'USD' ? Number(incoming.rate) || 0 : 0;

  return {
    rateIDR: incomingIDR || existing.rateIDR || legacyIDR,
    rateUSD: incomingUSD || existing.rateUSD || legacyUSD,
    rate: Number(incoming.rate) > 0 ? incoming.rate : existing.rate,
    currency: incoming.currency || existing.currency,
  };
};

export const expensesItemRatePatch = (existing: ExpensesItem, incoming: Omit<ExpensesItem, 'id'>): Partial<ExpensesItem> => {
  const legacyIDR = existing.defaultCurrency === 'IDR' ? existing.standardCostSell : 0;
  const legacyUSD = existing.defaultCurrency === 'USD' ? existing.standardCostSell : 0;
  const incomingIDR = Number(incoming.rateIDR) > 0
    ? Number(incoming.rateIDR)
    : incoming.defaultCurrency === 'IDR' ? Number(incoming.standardCostSell) || 0 : 0;
  const incomingUSD = Number(incoming.rateUSD) > 0
    ? Number(incoming.rateUSD)
    : incoming.defaultCurrency === 'USD' ? Number(incoming.standardCostSell) || 0 : 0;

  return {
    rateIDR: incomingIDR || existing.rateIDR || legacyIDR,
    rateUSD: incomingUSD || existing.rateUSD || legacyUSD,
    standardCostSell: Number(incoming.standardCostSell) > 0 ? incoming.standardCostSell : existing.standardCostSell,
    defaultCurrency: incoming.defaultCurrency || existing.defaultCurrency,
  };
};