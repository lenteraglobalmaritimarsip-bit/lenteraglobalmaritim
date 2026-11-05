const activePrintFrames = new WeakSet<HTMLIFrameElement>();
const frameLoadTimeoutMs = 3000;

export const printHtmlInFrame = (
  frame: HTMLIFrameElement,
  html: string,
  fileName: string,
): boolean => {
  if (activePrintFrames.has(frame)) return false;

  activePrintFrames.add(frame);
  const originalTitle = document.title;
  let isFinished = false;
  let isPrintScheduled = false;
  let loadTimeoutId = 0;

  const finish = () => {
    if (isFinished) return;
    isFinished = true;
    window.clearTimeout(loadTimeoutId);
    frame.removeEventListener('load', handleLoad);
    activePrintFrames.delete(frame);
    document.title = originalTitle;
  };

  const print = () => {
    if (isFinished || isPrintScheduled) return;
    isPrintScheduled = true;
    window.clearTimeout(loadTimeoutId);
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) {
      console.error('Unable to access the document prepared for printing.');
      finish();
      return;
    }

    printDocument.title = fileName;
    document.title = fileName;
    printWindow.addEventListener('afterprint', finish, { once: true });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } finally {
          finish();
        }
      });
    });
  };

  const handleLoad = () => print();
  loadTimeoutId = window.setTimeout(() => {
    const images = frame.contentDocument?.images;
    if (images) {
      Array.from(images).forEach((image) => {
        if (!image.complete) image.removeAttribute('src');
      });
    }
    print();
  }, frameLoadTimeoutMs);
  frame.addEventListener('load', handleLoad);
  frame.srcdoc = html;

  return true;
};
