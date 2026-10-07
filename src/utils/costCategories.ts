export const COST_CATEGORY_ORDER = [
  'PORT_SERVICE',
  'PORT_EXPENSES',
  'CLEARANCE',
  'GENERAL_EXPENSES',
  'CREW_EXPENSES',
  'AGENCY_FEE',
  'OWNER_MATTER',
  'TAX_CONTINGENCY',
  'PPH_INCOME_TAX',
  'VAT_11',
] as const;

export const COST_CATEGORY_LABELS: Record<string, string> = {
  PORT_SERVICE: 'PORT SERVICE',
  PORT_EXPENSES: 'PORT EXPENSES',
  CLEARANCE: 'CLEARANCE IN/OUT',
  GENERAL_EXPENSES: 'GENERAL EXPENSES',
  CREW_EXPENSES: 'CREW EXPENSES',
  AGENCY_FEE: 'AGENCY FEE',
  OWNER_MATTER: 'OWNER MATTER',
  TAX_CONTINGENCY: 'TAX & CONTINGENCY',
  PPH_INCOME_TAX: 'PPH / INCOME TAX',
  VAT_11: 'VAT 11%',
  PORT_DUES: 'PORT EXPENSES',
  PILOTAGE_TOWAGE: 'CLEARANCE IN/OUT',
  BERTHING: 'PORT EXPENSES',
  CREW_CHANGE: 'CREW EXPENSES',
  IMMIGRATION_CUSTOMS: 'CLEARANCE IN/OUT',
  LOGISTICS_SUPPLIES: 'GENERAL EXPENSES',
  SUNDRY: 'GENERAL EXPENSES',
};

export const normalizeCostCategory = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  const normalized = upper
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/[\/&%]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const aliases: Record<string, string> = {
    'PORT_SERVICE': 'PORT_SERVICE',
    'PORT_EXPENSES': 'PORT_EXPENSES',
    'CLEARANCE_IN/OUT': 'CLEARANCE',
    'CLEARANCE_IN_OUT': 'CLEARANCE',
    'CLEARANCE': 'CLEARANCE',
    'GENERAL_EXPENSES': 'GENERAL_EXPENSES',
    'CREW_EXPENSES': 'CREW_EXPENSES',
    'AGENCY_FEE': 'AGENCY_FEE',
    'OWNER_MATTER': 'OWNER_MATTER',
    'TAX_&_CONTINGENCY': 'TAX_CONTINGENCY',
    'TAX_AND_CONTINGENCY': 'TAX_CONTINGENCY',
    'TAX_CONTINGENCY': 'TAX_CONTINGENCY',
    'PPH_INCOME_TAX': 'PPH_INCOME_TAX',
    'VAT_11': 'VAT_11',
    'VAT_11_PERCENT': 'VAT_11',
    'PORT_DUES': 'PORT_EXPENSES',
    'BERTHING': 'PORT_EXPENSES',
    'PILOTAGE_TOWAGE': 'CLEARANCE',
    'IMMIGRATION_CUSTOMS': 'CLEARANCE',
    'LOGISTICS_SUPPLIES': 'GENERAL_EXPENSES',
    'SUNDRY': 'GENERAL_EXPENSES',
    'CREW_CHANGE': 'CREW_EXPENSES',
  };

  return aliases[normalized] ?? normalized;
};

export const getCostCategoryRank = (category?: string) => {
  const normalized = normalizeCostCategory(category);
  const index = COST_CATEGORY_ORDER.indexOf(normalized as (typeof COST_CATEGORY_ORDER)[number]);
  return index >= 0 ? index : COST_CATEGORY_ORDER.length;
};

export const formatCostCategoryLabel = (category?: string) => {
  const normalized = normalizeCostCategory(category);
  return COST_CATEGORY_LABELS[normalized] || normalized.replace(/_/g, ' ') || 'UNCATEGORIZED';
};
