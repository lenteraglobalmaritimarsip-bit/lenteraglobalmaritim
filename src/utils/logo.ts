export const getPublicLogoUrl = (): string =>
  new URL('lgm-logo.png', new URL(import.meta.env.BASE_URL, window.location.origin)).href;
