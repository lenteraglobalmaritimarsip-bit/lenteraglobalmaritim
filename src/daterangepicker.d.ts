declare module 'daterangepicker';

interface DateRangePickerMoment {
  format(format: string): string;
}

interface DateRangePickerInstance {
  startDate: DateRangePickerMoment;
  endDate: DateRangePickerMoment;
  setStartDate(value: string | Date): void;
  setEndDate(value: string | Date): void;
  remove(): void;
}

interface JQuery<TElement = HTMLElement> {
  daterangepicker(
    options: Record<string, unknown>,
  ): this;
}
