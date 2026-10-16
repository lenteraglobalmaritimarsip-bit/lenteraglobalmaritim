import React, { useEffect, useRef } from 'react';
import $ from 'jquery';
import moment from 'moment';
import 'daterangepicker/daterangepicker.css';
import { formatInquiryDate } from '../../utils/date';

const pluginGlobals = window as Window & { jQuery?: typeof $; moment?: typeof moment };
pluginGlobals.jQuery = $;
pluginGlobals.moment = moment;
const daterangepickerReady = import('daterangepicker');

export interface InquiryDateRange {
  from: string;
  to: string;
}

interface InquiryDateRangePickerProps {
  value: InquiryDateRange;
  onChange: (value: InquiryDateRange) => void;
  className?: string;
  variant?: 'dark' | 'light';
}

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const InquiryDateRangePicker: React.FC<InquiryDateRangePickerProps> = ({
  value,
  onChange,
  className = '',
  variant = 'dark',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<DateRangePickerInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    let disposed = false;
    let pickerInstance: DateRangePickerInstance | null = null;

    void daterangepickerReady.then(() => {
      if (disposed) return;
      const $input = $(input);
      $input.daterangepicker({
        autoApply: false,
        autoUpdateInput: false,
        linkedCalendars: false,
        showDropdowns: true,
        opens: 'center',
        drops: 'down',
        parentEl: 'body',
        buttonClasses: 'daterangepicker-action',
        applyButtonClasses: 'daterangepicker-apply',
        cancelButtonClasses: 'daterangepicker-cancel',
        locale: {
          format: 'DD-MM-YYYY',
          separator: ' - ',
          applyLabel: 'Terapkan',
          cancelLabel: 'Tutup',
          fromLabel: 'Dari',
          toLabel: 'Sampai',
          customRangeLabel: 'Rentang lain',
          weekLabel: 'Mg',
          daysOfWeek: dayNames,
          monthNames,
          firstDay: 1,
        },
      });
      $input.on('apply.daterangepicker', (_event, appliedPicker: DateRangePickerInstance) => {
        onChangeRef.current({
          from: appliedPicker.startDate.format('YYYY-MM-DD'),
          to: appliedPicker.endDate.format('YYYY-MM-DD'),
        });
      });
      pickerInstance = $input.data('daterangepicker') as DateRangePickerInstance;
      pickerRef.current = pickerInstance;
      syncPickerValue(pickerInstance, valueRef.current);
    });

    return () => {
      disposed = true;
      pickerInstance?.remove();
      if (pickerRef.current === pickerInstance) pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    syncPickerValue(picker, value);
  }, [value.from, value.to]);

  const inputClassName = variant === 'dark'
    ? 'w-[320px] max-w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500'
    : 'w-[320px] max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400';
  const labelClassName = variant === 'dark' ? 'text-[10px] font-semibold text-slate-400' : 'text-[10px] font-semibold text-slate-500';

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <label className="flex flex-col gap-1">
        <span className={labelClassName}>Tanggal Inquiry</span>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={value.from && value.to
            ? `${formatInquiryDate(value.from)} - ${formatInquiryDate(value.to)}`
            : ''}
          placeholder="Pilih rentang tanggal"
          aria-label="Rentang tanggal inquiry"
          className={inputClassName}
        />
      </label>
      {(value.from || value.to) && (
        <button
          type="button"
          onClick={() => onChange({ from: '', to: '' })}
          className={variant === 'dark'
            ? 'rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800'
            : 'rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100'}
          aria-label="Hapus rentang tanggal inquiry"
          title="Hapus rentang tanggal"
        >
          Hapus
        </button>
      )}
    </div>
  );
};

const syncPickerValue = (picker: DateRangePickerInstance, value: InquiryDateRange) => {
  const fallbackDate = value.from || value.to || new Date().toISOString().slice(0, 10);
  picker.setStartDate(new Date(`${value.from || fallbackDate}T00:00:00`));
  picker.setEndDate(new Date(`${value.to || value.from || fallbackDate}T00:00:00`));
};
