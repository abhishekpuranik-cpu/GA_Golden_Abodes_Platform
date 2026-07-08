/** Build Metaview web URLs for a sourcing search. */
export function metaviewSearchUrl(searchId) {
  if (!searchId) return null;
  const id = encodeURIComponent(String(searchId));
  // Primary deep-link used by Metaview web app; falls back to sourcing home.
  return `https://my.metaview.app/sourcing/${id}`;
}

export function metaviewSourcingHomeUrl() {
  return 'https://my.metaview.app/sourcing';
}
