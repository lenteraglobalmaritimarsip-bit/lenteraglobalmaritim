export const formatDateDisplay = (value?: string | Date | null, includeTime = false): string => {
  if (!value) return '-';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const datePart = raw.split('T')[0];
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day || year.length !== 4) return String(value);
  const formatted = `${day}/${month}/${year}`;
  if (!includeTime) return formatted;
  const timePart = raw.split('T')[1]?.slice(0, 5);
  return timePart ? `${formatted} ${timePart}` : formatted;
};
