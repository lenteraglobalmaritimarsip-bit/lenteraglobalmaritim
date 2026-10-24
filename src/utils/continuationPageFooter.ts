const CONTINUATION_PAGE_FOOTER_STYLES = `<style>
  @page {
    margin-bottom: 18mm;
    @bottom-center {
      content: "Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan\\A Kota Adm Jakarta Selatan, DKI Jakarta - 12810\\A email : maritim@lentera-global.com / web : www.lentera-global.com";
      white-space: pre;
      font: 600 8pt/1.2 Arial, sans-serif;
      color: #111;
      text-align: center;
    }
  }
  @page:first {
    @bottom-center {
      content: none;
    }
  }
  @media print {
    .office-footer {
      display: none !important;
    }
  }
</style>`;

export const addContinuationPageOfficeFooter = (html: string): string => {
  if (!html.includes('</head>')) {
    throw new Error('Print document is missing its closing head tag.');
  }
  return html.replace('</head>', `${CONTINUATION_PAGE_FOOTER_STYLES}</head>`);
};
