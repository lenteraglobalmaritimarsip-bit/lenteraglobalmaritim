// Displays dates as dd-mm-yyyy while form and API values remain ISO yyyy-mm-dd.
export const formatDateLong = (value: Date = new Date()): string => {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${value.getFullYear()}`;
};

export const formatDateDisplay = (value?: string | Date | null, includeTime = false): string => {
  if (!value) return '-';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '-';
    const formatted = `${String(value.getDate()).padStart(2, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${value.getFullYear()}`;
    if (!includeTime) return formatted;
    return `${formatted} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) return raw;
  const [, year, month, day, time] = match;
  const formatted = `${day}-${month}-${year}`;
  if (!includeTime) return formatted;
  return time ? `${formatted} ${time}` : formatted;
};

export const formatInquiryDate = (value?: string | Date | null): string =>
  formatDateDisplay(value);

export const getInquiryMonthKey = (value?: string | null): string => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const monthNumber = Number(match[2]);
  return monthNumber >= 1 && monthNumber <= 12 ? `${match[1]}-${match[2]}` : '';
};

export const formatMonthKey = (monthKey: string): string => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return monthKey;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(Number(match[1]), monthNumber - 1, 1));
};

export const isInquiryDateInRange = (value: string | undefined, from: string, to: string): boolean => {
  if (!from && !to) return true;
  const inquiryDate = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inquiryDate)) return false;
  return (!from || inquiryDate >= from) && (!to || inquiryDate <= to);
};

export const formatInquiryDateRange = (from: string, to: string): string => {
  if (!from && !to) return 'Semua Tanggal Inquiry';
  return `${from ? formatInquiryDate(from) : 'Awal'} s.d. ${to ? formatInquiryDate(to) : 'Akhir'}`;
};

export const getLatestInquiryMonthRange = (values: Array<string | undefined>): { from: string; to: string } => {
  const monthKey = values
    .map(getInquiryMonthKey)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!monthKey) return { from: '', to: '' };

  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
};
