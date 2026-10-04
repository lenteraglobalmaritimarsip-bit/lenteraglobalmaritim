const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Formats a date as "DD Month YYYY" in Indonesian, e.g. "04 Oktober 2026".
export const formatDateLong = (value: Date = new Date()): string => {
  const day = String(value.getDate()).padStart(2, '0');
  const month = INDONESIAN_MONTHS[value.getMonth()];
  return `${day} ${month} ${value.getFullYear()}`;
};

export const formatDateDisplay = (value?: string | Date | null, includeTime = false): string => {
  if (!value) return '-';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '-';
    const formatted = `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
    if (!includeTime) return formatted;
    return `${formatted} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) return raw;
  const [, year, month, day, time] = match;
  const formatted = `${day}/${month}/${year}`;
  if (!includeTime) return formatted;
  return time ? `${formatted} ${time}` : formatted;
};
