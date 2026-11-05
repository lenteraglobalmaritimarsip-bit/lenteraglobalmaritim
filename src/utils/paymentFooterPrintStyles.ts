export const paymentFooterPrintStyles = `
  .payment-footer {
    display: grid !important;
    grid-template-columns: minmax(0, 52%) minmax(0, 42%) !important;
    column-gap: 6% !important;
    align-items: start !important;
    width: 100% !important;
    margin: 2mm 0 0 !important;
    padding: 0 !important;
    transform: none !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  .payment-footer > .bank,
  .payment-footer > .signature {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    align-self: start !important;
    transform: none !important;
    vertical-align: top !important;
  }
  .payment-footer > .bank {
    display: block !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .payment-footer > .signature {
    display: block !important;
    text-align: center !important;
  }
`;
