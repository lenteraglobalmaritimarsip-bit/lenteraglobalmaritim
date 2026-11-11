export const getPublicLogoUrl = (): string =>
  new URL('lgm-logo.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;

export const getPublicPayrollSignatureUrl = (): string =>
  new URL('TTD_FINANCE.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;

export const getPublicLgfPayrollSignatureUrl = (): string =>
  new URL('TTD_FINANCE_LGF.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;

export const getPublicLgfManagingDirectorSignatureUrl = (): string =>
  new URL('TTD_MANAGING_DIRECTOR_LGF.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;

export const getPublicDirectorSignatureUrl = (): string =>
  new URL('TTD_DIREKTUR.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;
