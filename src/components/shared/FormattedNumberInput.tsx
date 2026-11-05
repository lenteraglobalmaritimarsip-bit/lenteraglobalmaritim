import React, { InputHTMLAttributes, useEffect, useLayoutEffect, useRef, useState } from 'react';

type FormattedNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: string | number;
  onValueChange: (value: string) => void;
  maximumFractionDigits?: number;
  emptyOnZero?: boolean;
  min?: number | string;
  max?: number | string;
};

const normalizeNumberInput = (value: string, maximumFractionDigits: number) => {
  const withoutGrouping = value.replace(/,/g, '');
  const filtered = withoutGrouping.replace(/[^\d.-]/g, '');
  const negative = filtered.startsWith('-');
  const unsigned = filtered.replace(/-/g, '');
  const decimalIndex = unsigned.indexOf('.');
  const integerPart = decimalIndex < 0 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionPart = decimalIndex < 0
    ? ''
    : unsigned.slice(decimalIndex + 1).replace(/\./g, '').slice(0, maximumFractionDigits);
  const hasDecimal = decimalIndex >= 0 && maximumFractionDigits > 0;
  return `${negative ? '-' : ''}${integerPart}${hasDecimal ? `.${fractionPart}` : ''}`;
};

const groupNumberInput = (value: string) => {
  if (!value) return '';
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integerPart, ...fractionParts] = unsigned.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${groupedInteger}${fractionParts.length ? `.${fractionParts.join('')}` : ''}`;
};

const formatNumber = (value: string | number, maximumFractionDigits: number, emptyOnZero: boolean) => {
  if (value === '') return '';
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numericValue)) return '';
  if (emptyOnZero && numericValue === 0) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(numericValue);
};

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onValueChange,
  maximumFractionDigits = 2,
  emptyOnZero = false,
  min,
  max,
  inputMode = 'decimal',
  onFocus,
  onBlur,
  ...inputProps
}) => {
  const [text, setText] = useState(() => formatNumber(value, maximumFractionDigits, emptyOnZero));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFocused) setText(formatNumber(value, maximumFractionDigits, emptyOnZero));
  }, [emptyOnZero, isFocused, maximumFractionDigits, value]);

  useLayoutEffect(() => {
    if (caretPositionRef.current === null || !inputRef.current) return;
    let remaining = caretPositionRef.current;
    let position = 0;
    while (position < text.length && remaining > 0) {
      if (text[position] !== ',') remaining -= 1;
      position += 1;
    }
    inputRef.current.setSelectionRange(position, position);
    caretPositionRef.current = null;
  }, [text]);

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      value={text}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        const normalized = normalizeNumberInput(text, maximumFractionDigits);
        const numericValue = Number(normalized);
        const minValue = min === undefined ? Number.NaN : Number(min);
        const maxValue = max === undefined ? Number.NaN : Number(max);
        const validationMessage = normalized !== '' && Number.isFinite(minValue) && numericValue < minValue
          ? `Masukkan nilai minimal ${minValue}.`
          : normalized !== '' && Number.isFinite(maxValue) && numericValue > maxValue
            ? `Masukkan nilai maksimal ${maxValue}.`
            : '';
        event.currentTarget.setCustomValidity(validationMessage);
        onValueChange(normalized);
        setText(formatNumber(normalized, maximumFractionDigits, emptyOnZero));
        setIsFocused(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const normalized = normalizeNumberInput(input.value, maximumFractionDigits);
        const numericValue = Number(normalized);
        const minValue = min === undefined ? Number.NaN : Number(min);
        const maxValue = max === undefined ? Number.NaN : Number(max);
        const validationMessage = normalized !== '' && Number.isFinite(minValue) && numericValue < minValue
          ? `Masukkan nilai minimal ${minValue}.`
          : normalized !== '' && Number.isFinite(maxValue) && numericValue > maxValue
            ? `Masukkan nilai maksimal ${maxValue}.`
            : '';
        input.setCustomValidity(validationMessage);
        const validCharsBeforeCaret = normalizeNumberInput(
          input.value.slice(0, input.selectionStart ?? input.value.length),
          maximumFractionDigits,
        ).length;
        caretPositionRef.current = validCharsBeforeCaret;
        setText(groupNumberInput(normalized));
        onValueChange(normalized);
      }}
    />
  );
};
