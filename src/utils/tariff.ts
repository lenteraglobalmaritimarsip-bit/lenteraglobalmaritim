export type CalculationBasis = 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
export type TariffType = 'FIXED' | 'VARIABLE' | 'QTY_CARGO' | 'RANGE';

export interface TariffFormulaDescriptionInput {
  description?: string;
  category?: string;
  basis?: string;
  quantity?: number;
  cargoQuantity?: number;
  absoluteValue?: number;
  rate?: number;
  tariffType?: TariffType;
}

export function describeTariffService(description: string): string | undefined {
  const source = description.toUpperCase().replace(/[_-]+/g, ' ');
  const isFixed = source.includes('FIXED') || source.includes('FIX');
  const isVariable = source.includes('VARIABLE') || source.includes('VAR');
  const mode = isFixed ? 'Fixed' : isVariable ? 'Variable' : '';

  if (source.includes('SHIFTING') && source.includes('PILOT')) return `Shifting Pilotage${mode ? ` ${mode}` : ''}`;
  if (source.includes('PILOT')) return `Pilotage${mode ? ` ${mode}` : ''}`;
  if (source.includes('TUG') || source.includes('TOW')) return `Tuggage${mode ? ` ${mode}` : ''}`;
  if (source.includes('HARBOUR') || source.includes('HARBOR')) return 'Harbour Dues';
  if (source.includes('LIGHT DUE') || source.includes('LIGHT')) return 'Light Dues';
  return undefined;
}

export function describeTariffQuantityUnit(description: string): string | undefined {
  const source = description.toUpperCase().replace(/[_-]+/g, ' ');
  if (source.includes('SHIFTING') && source.includes('PILOT')) return 'IN/OUT';
  if (source.includes('PILOT')) return 'IN/OUT';
  if (source.includes('TUG') || source.includes('TOW')) return 'HRS';
  if (source.includes('HARBOUR') || source.includes('HARBOR')) return 'Periode';
  if (source.includes('LIGHT DUE') || source.includes('LIGHT')) return 'Periode';
  return undefined;
}

export function describeTariffFormula({ description = '', category = '', basis = '', quantity = 1, cargoQuantity = 0, absoluteValue, rate = 0, tariffType }: TariffFormulaDescriptionInput): string {
  const source = `${basis} ${category} ${description}`.toUpperCase();
  const normalizedBasis = basis.toUpperCase();
  const normalizedCategory = category.toUpperCase().replaceAll(' ', '_');
  const formatNumber = (value: number) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const quantityUnit = describeTariffQuantityUnit(description);
  const quantityLabel = `${formatNumber(quantity)}${quantityUnit ? ` ${quantityUnit}` : ''}`;
  const isFixed = tariffType === 'FIXED' || normalizedBasis.includes('LUMP_SUM') || source.includes('FIXED');
  const rateLabel = Number(rate || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

  if (tariffType === 'QTY_CARGO' || tariffType === 'RANGE') {
    return `${formatNumber(cargoQuantity)} x ${rateLabel} x ${quantityLabel}`;
  }

  if (isFixed) {
    return `${rateLabel} x ${quantityLabel}`;
  }

  if (tariffType === 'VARIABLE') {
    const absoluteGRT = Number(absoluteValue || 0);
    return absoluteGRT > 0
      ? `${formatNumber(absoluteGRT)} x ${rateLabel} x ${quantityLabel}`
      : `GRT x ${rateLabel} x ${quantityLabel}`;
  }

  if (normalizedCategory === 'PORT_EXPENSES') {
    const absoluteGRT = Number(absoluteValue || 0);
    return absoluteGRT > 0
      ? `${formatNumber(absoluteGRT)} x ${rateLabel} x ${quantityLabel}`
      : `- x ${rateLabel} x ${quantityLabel}`;
  }

  if (normalizedBasis.includes('PER_GRT') || source.includes('GRT') || source.includes('PORT DUES') || source.includes('BERTHING')) {
    return `GRT x ${rateLabel} x ${quantityLabel}`;
  }
  if (normalizedBasis.includes('PER_DAY') || source.includes('PER DAY') || source.includes('DAY') || source.includes('HARI')) {
    return `Days x ${rateLabel} x ${quantityLabel}`;
  }
  if (normalizedBasis.includes('PER_HOUR') || source.includes('PER HOUR') || source.includes('HOUR') || source.includes('JAM')) {
    return `Hours x ${rateLabel} x ${quantityLabel}`;
  }
  if (normalizedBasis.includes('PER_MOVE') || source.includes('PER MOVE') || source.includes('MOVE') || source.includes('SHIFT') || source.includes('PILOTAGE') || source.includes('TOWAGE')) {
    return `Moves x ${rateLabel} x ${quantityLabel}`;
  }
  if (normalizedBasis.includes('LUMP_SUM') || source.includes('LUMP') || source.includes('FIXED') || source.includes('CLEARANCE') || source.includes('AGENCY FEE')) {
    return `Lump sum / ${rateLabel} x ${quantityLabel}`;
  }
  return `${rateLabel} x ${quantityLabel}`;
}

export interface TariffCalculationInput {
  vesselGRT?: number;
  cargoQuantity?: number;
  estimatedDays?: number;
  hours?: number;
  moveCount?: number;
  rate: number;
  minCharge: number;
  calculationBasis: CalculationBasis;
  tariffType?: TariffType;
}

export function matchesTariffGRT(
  vesselGRT: number | string | undefined,
  tariffGRT?: number | string,
  grtMin?: number | string,
  grtMax?: number | string,
): boolean {
  const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
  const rangeParts = typeof tariffGRT === 'string'
    ? tariffGRT.trim().split(/\s*(?:-|–|—|\bto\b)\s*/i)
    : [];
  const legacyRange = rangeParts.length === 2;
  const explicitMinimum = hasValue(grtMin) ? parseTariffNumber(grtMin, Number.NaN) : 0;
  const explicitMaximum = hasValue(grtMax) ? parseTariffNumber(grtMax, Number.NaN) : 0;
  const hasPositiveExplicitBound = explicitMinimum > 0 || explicitMaximum > 0;
  const hasInvalidExplicitBound = [grtMin, grtMax].some((bound) =>
    hasValue(bound) && !Number.isFinite(parseTariffNumber(bound, Number.NaN))
  );
  let minimumSource: unknown;
  let maximumSource: unknown;
  let usesRange = false;

  if (hasPositiveExplicitBound || hasInvalidExplicitBound) {
    minimumSource = hasValue(grtMin) ? grtMin : tariffGRT;
    maximumSource = hasValue(grtMax) ? grtMax : tariffGRT;
    usesRange = true;
  } else if (legacyRange) {
    [minimumSource, maximumSource] = rangeParts;
    usesRange = true;
  } else if (parseTariffNumber(tariffGRT) > 0) {
    minimumSource = tariffGRT;
    maximumSource = tariffGRT;
  } else {
    return true;
  }

  const hasMinimum = hasValue(minimumSource);
  const hasMaximum = hasValue(maximumSource);
  if (!hasMinimum && !hasMaximum) return true;

  const value = parseTariffNumber(vesselGRT, Number.NaN);
  const minimum = hasMinimum ? parseTariffNumber(minimumSource, Number.NaN) : 0;
  const maximum = hasMaximum ? parseTariffNumber(maximumSource, Number.NaN) : 0;
  if (!Number.isFinite(value) || value <= 0) return false;
  if ((hasMinimum && !Number.isFinite(minimum)) || (hasMaximum && !Number.isFinite(maximum))) return false;

  if (usesRange) {
    return (!hasMinimum || minimum <= 0 || value >= minimum)
      && (!hasMaximum || maximum <= 0 || value <= maximum);
  }
  if (maximum <= 0) return true;
  return value === maximum;
}

export function hasTariffGRTRestriction(record: {
  grt?: unknown;
  grtMin?: unknown;
  grtMax?: unknown;
}): boolean {
  const bounds = [record.grtMin, record.grtMax];
  if (bounds.some((bound) => parseTariffNumber(bound) > 0)) return true;
  if (bounds.some((bound) => bound !== undefined && bound !== null && String(bound).trim() && !Number.isFinite(parseTariffNumber(bound, Number.NaN)))) return true;
  if (typeof record.grt === 'string' && record.grt.trim().split(/\s*(?:-|–|—|\bto\b)\s*/i).length === 2) return true;
  return parseTariffNumber(record.grt) > 0;
}

export function filterTariffsByGRT<T extends {
  name: string;
  category: string;
  grt?: unknown;
  grtMin?: unknown;
  grtMax?: unknown;
}>(records: T[], vesselGRT: number | string | undefined): T[] {
  return records.filter((record) => !hasTariffGRTRestriction(record)
    || matchesTariffGRT(
      vesselGRT,
      record.grt as number | string | undefined,
      record.grtMin as number | string | undefined,
      record.grtMax as number | string | undefined,
    ));
}

export function prefersSpecificTariffGRTRange(
  candidateMin: unknown,
  candidateMax: unknown,
  currentMin: unknown,
  currentMax: unknown,
): boolean {
  const positiveBoundCount = (minimum: unknown, maximum: unknown) =>
    Number(parseTariffNumber(minimum) > 0) + Number(parseTariffNumber(maximum) > 0);
  const candidateBounds = positiveBoundCount(candidateMin, candidateMax);
  const currentBounds = positiveBoundCount(currentMin, currentMax);
  if (candidateBounds !== currentBounds) return candidateBounds > currentBounds;

  if (candidateBounds === 2) {
    const candidateWidth = parseTariffNumber(candidateMax) - parseTariffNumber(candidateMin);
    const currentWidth = parseTariffNumber(currentMax) - parseTariffNumber(currentMin);
    return candidateWidth < currentWidth;
  }
  if (candidateBounds === 1) {
    const candidateMinimum = parseTariffNumber(candidateMin);
    const candidateMaximum = parseTariffNumber(candidateMax);
    const currentMinimum = parseTariffNumber(currentMin);
    const currentMaximum = parseTariffNumber(currentMax);
    if (candidateMinimum > 0 && currentMinimum > 0) return candidateMinimum > currentMinimum;
    if (candidateMaximum > 0 && currentMaximum > 0) return candidateMaximum < currentMaximum;
  }
  return false;
}

export function selectPreferredTariffOptions<T extends {
  name: string;
  category: string;
  source: 'FIX_TARIFF' | 'EXPENSES_ITEM';
  grtMin?: unknown;
  grtMax?: unknown;
}>(options: T[]): T[] {
  return options.reduce<T[]>((selected, option) => {
    const existingIndex = selected.findIndex((item) =>
      item.name.trim().toLowerCase() === option.name.trim().toLowerCase()
      && item.category === option.category
    );
    if (existingIndex < 0) return [...selected, option];

    const existing = selected[existingIndex];
    const preferOption = option.source === 'FIX_TARIFF'
      && existing.source !== 'FIX_TARIFF'
      || option.source === 'FIX_TARIFF'
        && existing.source === 'FIX_TARIFF'
        && prefersSpecificTariffGRTRange(option.grtMin, option.grtMax, existing.grtMin, existing.grtMax);
    if (!preferOption) return selected;
    return selected.map((item, index) => index === existingIndex ? option : item);
  }, []);
}

export function parseTariffNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  const normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '');
  if (!normalized) return fallback;
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return fallback;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatTariffNumber(value: unknown): string {
  if (value === undefined || value === null || String(value).trim() === '') return '-';
  const parsed = parseTariffNumber(value, Number.NaN);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 2 }).format(parsed)
    : '-';
}

export function getTariffRateForCurrency(
  currency: 'IDR' | 'USD',
  rateIDR: unknown,
  rateUSD: unknown,
  legacyRate: unknown,
  legacyCurrency?: 'IDR' | 'USD',
): number {
  const explicitRate = parseTariffNumber(currency === 'IDR' ? rateIDR : rateUSD, Number.NaN);
  if (Number.isFinite(explicitRate) && explicitRate > 0) return explicitRate;
  return legacyCurrency === currency ? parseTariffNumber(legacyRate) : 0;
}

export function getTariffBasisValue({
  vesselGRT = 0,
  estimatedDays = 0,
  hours = 0,
  moveCount = 0,
  calculationBasis,
}: Pick<TariffCalculationInput, 'vesselGRT' | 'estimatedDays' | 'hours' | 'moveCount' | 'calculationBasis'>): number {
  switch (calculationBasis) {
    case 'PER_GRT':
      return vesselGRT;
    case 'PER_DAY':
      return estimatedDays;
    case 'PER_HOUR':
      return hours;
    case 'PER_MOVE':
      return moveCount;
    case 'LUMP_SUM':
      return 1;
    default:
      return 0;
  }
}

export function calculateTariffForJob({
  vesselGRT = 0,
  cargoQuantity = 0,
  estimatedDays = 0,
  hours = 0,
  moveCount = 0,
  rate,
  calculationBasis,
  tariffType,
}: TariffCalculationInput): number {
  const resolvedType = tariffType ?? (calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');

  if (resolvedType === 'FIXED') {
    return rate;
  }

  if (resolvedType === 'QTY_CARGO' || resolvedType === 'RANGE') {
    return cargoQuantity * rate;
  }

  return vesselGRT * rate;
}
