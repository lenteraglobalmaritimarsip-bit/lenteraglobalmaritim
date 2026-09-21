export type CalculationBasis = 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
export type TariffType = 'FIXED' | 'VARIABLE' | 'RANGE';

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
