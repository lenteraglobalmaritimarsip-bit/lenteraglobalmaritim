export type CalculationBasis = 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
export type TariffType = 'FIXED' | 'VARIABLE' | 'RANGE';

export interface TariffFormulaDescriptionInput {
  description?: string;
  category?: string;
  basis?: string;
  quantity?: number;
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

export function describeTariffFormula({ description = '', category = '', basis = '', quantity = 1, absoluteValue, rate = 0, tariffType }: TariffFormulaDescriptionInput): string {
  const source = `${basis} ${category} ${description}`.toUpperCase();
  const normalizedBasis = basis.toUpperCase();
  const normalizedCategory = category.toUpperCase().replaceAll(' ', '_');
  const formatNumber = (value: number) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const quantityUnit = describeTariffQuantityUnit(description);
  const quantityLabel = `${formatNumber(quantity)}${quantityUnit ? ` ${quantityUnit}` : ''}`;
  const isFixed = tariffType === 'FIXED' || normalizedBasis.includes('LUMP_SUM') || source.includes('FIXED');
  const rateLabel = Number(rate || 0).toLocaleString('id-ID', { maximumFractionDigits: 6 });

  if (isFixed) {
    return `${rateLabel} x ${quantityLabel}`;
  }

  if (normalizedCategory === 'PORT_EXPENSES') {
    const absoluteGRT = Number(absoluteValue || 0);
    return absoluteGRT > 0
      ? `${formatNumber(absoluteGRT)} x ${rateLabel} x ${quantityLabel}`
      : `- x ${rateLabel} x ${quantityLabel}`;
  }

  if (normalizedBasis.includes('PER_GRT') || source.includes('GRT') || source.includes('PORT DUES') || source.includes('BERTHING')) {
    return `GRT x ${rateLabel} x ${quantityLabel} (minimum charge applies)`;
  }
  if (normalizedBasis.includes('PER_DAY') || source.includes('PER DAY') || source.includes('DAY') || source.includes('HARI')) {
    return `Days x ${rateLabel} x ${quantityLabel} (minimum charge applies)`;
  }
  if (normalizedBasis.includes('PER_HOUR') || source.includes('PER HOUR') || source.includes('HOUR') || source.includes('JAM')) {
    return `Hours x ${rateLabel} x ${quantityLabel} (minimum charge applies)`;
  }
  if (normalizedBasis.includes('PER_MOVE') || source.includes('PER MOVE') || source.includes('MOVE') || source.includes('SHIFT') || source.includes('PILOTAGE') || source.includes('TOWAGE')) {
    return `Moves x ${rateLabel} x ${quantityLabel} (minimum charge applies)`;
  }
  if (normalizedBasis.includes('LUMP_SUM') || source.includes('LUMP') || source.includes('FIXED') || source.includes('CLEARANCE') || source.includes('AGENCY FEE')) {
    return `Lump sum / ${rateLabel} x ${quantityLabel}`;
  }
  return `${rateLabel} x ${quantityLabel}`;
}

export interface TariffCalculationInput {
  vesselGRT?: number;
  estimatedDays?: number;
  hours?: number;
  moveCount?: number;
  rate: number;
  minCharge: number;
  calculationBasis: CalculationBasis;
  tariffType?: TariffType;
}

export function matchesTariffGRT(vesselGRT: number | undefined, tariffGRT?: number, grtMin?: number, grtMax?: number): boolean {
  const value = Number(vesselGRT || 0);
  if (!Number.isFinite(value) || value <= 0) return !grtMin && !grtMax && !tariffGRT;

  const minimum = Number(grtMin ?? tariffGRT ?? 0);
  const maximum = Number(grtMax ?? tariffGRT ?? 0);
  if (minimum <= 0 && maximum <= 0) return true;
  if (grtMin !== undefined || grtMax !== undefined) {
    return (minimum <= 0 || value >= minimum) && (maximum <= 0 || value <= maximum);
  }
  return value === maximum;
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
  estimatedDays = 0,
  hours = 0,
  moveCount = 0,
  rate,
  minCharge,
  calculationBasis,
  tariffType,
}: TariffCalculationInput): number {
  const resolvedType = tariffType ?? (calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');

  if (resolvedType === 'FIXED') {
    return Math.max(rate, minCharge);
  }

  const basisValue = getTariffBasisValue({
    vesselGRT,
    estimatedDays,
    hours,
    moveCount,
    calculationBasis,
  });

  const computed = basisValue * rate;
  return Math.max(computed, minCharge);
}
