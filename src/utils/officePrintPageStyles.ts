export const officePrintPageStyles = `<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  @media screen, print {
    .office-preview-content,
    .office-preview-content * {
      font-family: Arial, sans-serif !important;
    }
    .office-preview-content {
      font-size: 11px !important;
    }
    .office-preview-content table th,
    .office-preview-content table td {
      font-size: 11px !important;
    }
    .office-preview-content h2 {
      font-size: 14px !important;
    }
    .office-preview-content .brand,
    .office-preview-content .brand-name {
      font-size: 23px !important;
    }
    .office-preview-content .tag,
    .office-preview-content .tagline {
      font-size: 15px !important;
    }
    .office-preview-content .bank,
    .office-preview-content .signature,
    .office-preview-content .sign {
      font-size: 13px !important;
    }
    .office-preview-page > .office-footer {
      font-family: Arial, sans-serif !important;
      font-size: 9px !important;
    }
    .office-preview-content tr.subtotal,
    .office-preview-content tr.grand,
    .office-preview-content tr.grand-total,
    .office-preview-content tr.net-total,
    .office-preview-content tr.total-amount,
    .office-preview-content tr.epda-grand-total-row,
    .office-preview-content tr.fda-grand-total-row {
      background-color: #dbe8f2 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .office-preview-content tr.subtotal > td,
    .office-preview-content tr.grand > td,
    .office-preview-content tr.grand-total > td,
    .office-preview-content tr.net-total > td,
    .office-preview-content tr.total-amount > td,
    .office-preview-content tr.epda-grand-total-row > td,
    .office-preview-content tr.fda-grand-total-row > td {
      background-color: #dbe8f2 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
  @media screen {
    html {
      min-height: 100% !important;
      height: auto !important;
      overflow: auto !important;
      background: #e2e8f0 !important;
    }
    body {
      position: relative !important;
      display: block !important;
      width: 210mm !important;
      min-width: 210mm !important;
      max-width: 210mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      padding: 0 !important;
      overflow: visible !important;
      background: transparent !important;
    }
    .office-preview-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5mm;
      width: 210mm;
      margin: 8mm auto;
    }
    .office-preview-page {
      position: relative;
      flex: none;
      width: 210mm;
      height: 297mm;
      box-sizing: border-box;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 5px #0004;
    }
    .office-preview-page::before {
      position: absolute;
      inset: 10mm;
      border: 1.5pt solid #1f2937;
      content: "";
      pointer-events: none;
      z-index: 9;
    }
    .office-preview-content {
      position: absolute;
      inset: 15mm 13mm 50mm;
      overflow: hidden;
    }
    .office-preview-content > table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    .office-preview-content .bank {
      transform: none !important;
    }
    .office-preview-page > .office-footer {
      position: absolute !important;
      left: 50% !important;
      right: auto !important;
      bottom: 12mm !important;
      box-sizing: border-box !important;
      width: calc(100% - 20mm) !important;
      max-width: 700px !important;
      margin: 0 auto !important;
      transform: translateX(-50%) !important;
      display: block !important;
      text-align: center !important;
      z-index: 10 !important;
    }
    .office-footer span {
      color: #dc2626 !important;
    }
  }
  @media print {
    .office-preview-pages {
      display: block !important;
      width: 210mm !important;
      margin: 0 !important;
    }
    html, body {
      width: 210mm !important;
      min-width: 210mm !important;
      max-width: 210mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
    }
    body {
      position: relative !important;
      display: block !important;
      box-sizing: border-box !important;
    }
    .office-preview-page {
      position: relative !important;
      display: block !important;
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      margin: 0 !important;
      background: #fff !important;
      box-shadow: none !important;
      break-after: page !important;
      page-break-after: always !important;
    }
    .office-preview-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .office-preview-page::before {
      position: absolute !important;
      inset: 10mm !important;
      border: 1.5pt solid #1f2937 !important;
      content: "" !important;
      pointer-events: none !important;
      z-index: 9 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .office-preview-content {
      position: absolute !important;
      inset: 15mm 13mm 50mm !important;
      overflow: hidden !important;
    }
    .office-preview-content > table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    .office-preview-page > .office-footer {
      position: absolute !important;
      left: 50% !important;
      right: auto !important;
      bottom: 12mm !important;
      display: block !important;
      box-sizing: border-box !important;
      width: calc(100% - 20mm) !important;
      max-width: 700px !important;
      margin: 0 auto !important;
      transform: translateX(-50%) !important;
      text-align: center !important;
      z-index: 10 !important;
    }
    .office-footer span {
      color: #dc2626 !important;
    }
    .office-preview-content .bank {
      transform: none !important;
    }
  }
</style><script>
  (function () {
    var isScreen = window.matchMedia && window.matchMedia('screen').matches;
    if (!isScreen) return;

    var body;
    var originalNodes;
    var pagesRoot;
    var footerTemplate;

    function renderPages() {
      if (pagesRoot && pagesRoot.parentNode) pagesRoot.parentNode.removeChild(pagesRoot);
      body.innerHTML = '';
      pagesRoot = document.createElement('div');
      pagesRoot.className = 'office-preview-pages';
      body.appendChild(pagesRoot);

      var page;
      var content;
      function addPage() {
        page = document.createElement('section');
        page.className = 'office-preview-page';
        content = document.createElement('div');
        content.className = 'office-preview-content';
        page.appendChild(content);
        if (footerTemplate) page.appendChild(footerTemplate.cloneNode(true));
        pagesRoot.appendChild(page);
      }
      function isOverfull() {
        if (content.scrollHeight > content.clientHeight + 1) return true;
        var contentBottom = content.getBoundingClientRect().bottom;
        return Array.prototype.some.call(content.children, function (child) {
          return child.getBoundingClientRect().bottom > contentBottom + 1;
        });
      }
      function makeTablePage(sourceTable) {
        var table = sourceTable.cloneNode(false);
        Array.prototype.forEach.call(sourceTable.children, function (child) {
          if (child.tagName === 'CAPTION' || child.tagName === 'COLGROUP' || child.tagName === 'THEAD') {
            table.appendChild(child.cloneNode(true));
          }
        });
        var tbody = document.createElement('tbody');
        table.appendChild(tbody);
        content.appendChild(table);
        return { table: table, tbody: tbody };
      }
      function addTable(sourceTable) {
        var hadContent = content.children.length > 0;
        var current = makeTablePage(sourceTable);
        var sourceBodies = sourceTable.tBodies;

        Array.prototype.forEach.call(sourceBodies, function (sourceBody) {
          Array.prototype.forEach.call(sourceBody.rows, function (sourceRow) {
            var row = sourceRow.cloneNode(true);
            current.tbody.appendChild(row);
            if (!isOverfull()) return;

            current.tbody.removeChild(row);
            var hasRows = current.tbody.rows.length > 0;
            if (hasRows || hadContent) {
              if (!hasRows) content.removeChild(current.table);
              addPage();
              current = makeTablePage(sourceTable);
              hadContent = false;
            }
            current.tbody.appendChild(row);
          });
        });

        Array.prototype.forEach.call(sourceTable.tFoot ? [sourceTable.tFoot] : [], function (sourceFoot) {
          var foot = sourceFoot.cloneNode(true);
          current.table.appendChild(foot);
          if (isOverfull() && current.tbody.rows.length > 0) {
            current.table.removeChild(foot);
            addPage();
            current = makeTablePage(sourceTable);
            current.table.appendChild(foot);
          }
        });
      }

      function addPaymentFooter(footerNode) {
        var previous = content.lastElementChild;
        if (!previous || previous.tagName !== 'TABLE') {
          content.appendChild(footerNode);
          return;
        }

        content.appendChild(footerNode);
        if (!isOverfull()) return;
        content.removeChild(footerNode);

        var sourceTable = originalNodes.find(function (node) {
          return node.nodeType === 1 && node.tagName === 'TABLE';
        });
        var previousBody = previous.tBodies[0];
        if (!sourceTable || !previousBody || previousBody.rows.length === 0) {
          content.appendChild(footerNode);
          return;
        }

        addPage();
        var next = makeTablePage(sourceTable);
        while (previousBody.rows.length > 1) {
          next.tbody.insertBefore(previousBody.rows[previousBody.rows.length - 1], next.tbody.firstChild);
          content.appendChild(footerNode);
          if (!isOverfull()) return;
          content.removeChild(footerNode);
        }
        content.appendChild(footerNode);
      }

        addPage();
      originalNodes.forEach(function (node) {
        if (node.nodeType === 3 && !node.textContent.trim()) return;
        if (node.nodeType === 1 && (
          node.classList.contains('a4-page-frame')
          || node.classList.contains('a4-frame-line')
          || node.classList.contains('office-footer')
        )) return;
        if (node.nodeType === 1 && node.tagName === 'TABLE') {
          addTable(node);
          return;
        }

        if (node.nodeType === 1 && node.classList.contains('payment-footer')) {
          addPaymentFooter(node);
          return;
        }

        content.appendChild(node);
        if (isOverfull() && content.children.length > 1) {
          content.removeChild(node);
          addPage();
          content.appendChild(node);
        }
      });
    }

    function initialize() {
      body = document.body;
      originalNodes = Array.prototype.slice.call(body.childNodes);
      footerTemplate = originalNodes.find(function (node) {
        return node.nodeType === 1 && node.classList.contains('office-footer');
      });
      window.addEventListener('beforeprint', function () {
        if (!pagesRoot || !pagesRoot.isConnected) renderPages();
      });
      renderPages();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
      initialize();
    }
  })();
</script>`;
