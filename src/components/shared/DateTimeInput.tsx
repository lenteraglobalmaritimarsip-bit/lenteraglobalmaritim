import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateDisplay } from '../../utils/date';

interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  inputClassName: string;
  disabled?: boolean;
  ariaLabel: string;
}

export const DateTimeInput: React.FC<DateTimeInputProps> = ({ value, onChange, inputClassName, disabled = false, ariaLabel }) => {
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
        disabled={disabled}
        value={value ? formatDateDisplay(value, true) : ''}
        placeholder="dd-mm-yyyy --:--"
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
        type="datetime-local"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
    </div>
  );
};