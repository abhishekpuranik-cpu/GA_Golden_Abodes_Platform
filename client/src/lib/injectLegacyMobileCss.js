const MOBILE_CSS_ID = 'ga-vault-mobile-css';
const MOBILE_CSS_HREF = '/ga-vault-mobile.css';
const RESKIN_CSS_ID = 'ga-vault-reskin-css';
const RESKIN_CSS_HREF = '/legacy/ga-reskin-theme.css';

function injectStylesheet(doc, id, href) {
  if (doc.getElementById(id)) return;
  const link = doc.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  doc.head.appendChild(link);
}

/** Inject shared mobile + GA reskin stylesheets into a same-origin legacy app iframe. */
export function injectLegacyMobileCss(iframeEl) {
  try {
    const doc = iframeEl?.contentDocument;
    if (!doc) return;
    injectStylesheet(doc, MOBILE_CSS_ID, MOBILE_CSS_HREF);
    injectStylesheet(doc, RESKIN_CSS_ID, RESKIN_CSS_HREF);
  } catch {
    /* cross-origin or not ready */
  }
}
