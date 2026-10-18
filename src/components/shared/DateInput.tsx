import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateDisplay } from '../../utils/date';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  inputClassName: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  ariaLabel: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  inputClassName,
  required = false,
  disabled = false,
  min,
  max,
  ariaLabel,
}) => {
  const pickerRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (picker?.showPicker) picker.showPicker();
    else picker?.click();
  };

  return (
    <div className="relative">
      <input
        type="text"
        readOnly
        required={required}
        disabled={disabled}
        value={value ? formatDateDisplay(value) : ''}
        placeholder="dd-mm-yyyy"
        onClick={openPicker}
        aria-label={ariaLabel}
        className={`${inputClassName} pr-10`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-label={`Pilih ${ariaLabel.toLowerCase()}`}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays size={16} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
    </div>
  );
};