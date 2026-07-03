import { DOC_GROUPS, TYPE_LABELS } from '../../data/postsales/stepDocs.js';

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function tokens(q) {
  return norm(q).split(/\s+/).filter(Boolean);
}

function haystack(doc, groupLabel) {
  const typeLabel = TYPE_LABELS[doc.docType] || doc.docType || '';
  return [
    typeLabel,
    doc.docType,
    doc.label,
    doc.fileName,
    doc.checklistItem,
    doc.milestoneName,
    doc.status,
    doc.uploadedBy,
    groupLabel,
    doc.stepNumber != null ? `step ${doc.stepNumber}` : '',
    doc.checklistIndex != null ? `line ${doc.checklistIndex + 1}` : '',
  ].filter(Boolean).join(' ');
}

export function docMatchesQuery(doc, query, groupLabel = '') {
  const q = norm(query);
  if (!q) return true;
  const h = haystack(doc, groupLabel);
  const parts = tokens(q);
  if (parts.length === 1 && q.length <= 2) return h.includes(q);
  return parts.every((t) => h.includes(t));
}

export function groupLabelForDocType(docType) {
  const g = DOC_GROUPS.find((gr) => gr.types.includes(docType));
  return g?.label || '';
}

export function stepForDocType(docType) {
  const g = DOC_GROUPS.find((gr) => gr.types.includes(docType));
  return g?.step;
}

/** Flat ranked matches for smart search results panel. */
export function searchVaultDocuments(documents = [], query = '') {
  const q = norm(query);
  if (!q) return [];
  const hits = [];
  for (const doc of documents) {
    const groupLabel = groupLabelForDocType(doc.docType);
    if (!docMatchesQuery(doc, q, groupLabel)) continue;
    const typeLabel = TYPE_LABELS[doc.docType] || doc.docType;
    let subtitle = groupLabel || (doc.stepNumber ? `Step ${doc.stepNumber}` : '');
    if (doc.milestoneName) subtitle = [doc.milestoneName, subtitle].filter(Boolean).join(' · ');
    if (doc.checklistItem) subtitle = [subtitle, doc.checklistItem].filter(Boolean).join(' · ');
    hits.push({
      doc,
      title: doc.fileName || doc.label || typeLabel,
      subtitle,
      typeLabel,
      step: doc.stepNumber ?? stepForDocType(doc.docType),
    });
  }
  hits.sort((a, b) => {
    const sa = a.step ?? 99;
    const sb = b.step ?? 99;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });
  return hits;
}
