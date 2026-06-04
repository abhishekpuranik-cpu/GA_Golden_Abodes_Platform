const MOBILE_CSS_ID = 'ga-vault-mobile-css';
const MOBILE_CSS_HREF = '/ga-vault-mobile.css';

/** Inject shared mobile stylesheet into a same-origin legacy app iframe. */
export function injectLegacyMobileCss(iframeEl) {
  try {
    const doc = iframeEl?.contentDocument;
    if (!doc || doc.getElementById(MOBILE_CSS_ID)) return;
    const link = doc.createElement('link');
    link.id = MOBILE_CSS_ID;
    link.rel = 'stylesheet';
    link.href = MOBILE_CSS_HREF;
    doc.head.appendChild(link);
  } catch {
    /* cross-origin or not ready */
  }
}
