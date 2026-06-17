/** Shared PreConstruction notify copy — same structure for email and WhatsApp. */

export const PUBLIC_ORIGIN = () =>
  String(
    process.env.PUBLIC_APP_ORIGIN ||
      process.env.RENDER_EXTERNAL_URL ||
      'https://ga-golden-abodes-platform.onrender.com'
  ).replace(/\/$/, '');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain-text body (WhatsApp + email text part).
 * @param {object} ctx
 */
export function buildPreconNotifyBody(ctx) {
  const {
    kind,
    projectName,
    phaseName,
    taskName,
    author,
    text,
    nextAction,
    nextActionDate,
    fileLabels = [],
    attachmentLinks = []
  } = ctx;
  const lines = [
    'Golden Abodes · Project Update',
    projectName || 'Project',
    `Phase: ${phaseName || '—'}`,
    `Activity: ${taskName || '—'}`,
    ''
  ];
  if (kind === 'activity') {
    lines.push(`${author || 'Team'} added file(s):`);
    fileLabels.forEach((l) => lines.push(`• ${l}`));
  } else if (kind === 'status') {
    lines.push(`${author || 'Team'} updated activity status`);
    lines.push(text || '—');
  } else {
    lines.push(`${author || 'Team'}`);
    lines.push(text || '—');
    lines.push('');
    lines.push(`Next: ${nextAction || '—'}`);
    lines.push(`Due: ${nextActionDate || '—'}`);
    if (fileLabels.length) {
      lines.push('');
      lines.push(`Attachments (${fileLabels.length}):`);
      fileLabels.forEach((l) => lines.push(`• ${l}`));
    }
  }
  const linkOnly = (attachmentLinks || []).filter((l) => l?.url);
  if (linkOnly.length) {
    lines.push('');
    lines.push('Download:');
    linkOnly.forEach(({ label, url }) => {
      lines.push(`• ${label || 'File'}`);
      lines.push(url);
    });
  }
  lines.push('');
  lines.push(`Open: ${PUBLIC_ORIGIN()}/preconstruction/`);
  return lines.join('\n').slice(0, 8000);
}

export function buildPreconNotifySubject(ctx) {
  const { kind, projectName, taskName } = ctx;
  const proj = projectName || 'Project';
  const task = taskName || 'Activity';
  if (kind === 'activity') return `[PreConstruction] ${proj} — New file(s): ${task}`;
  if (kind === 'status') return `[PreConstruction] ${proj} — Status: ${task}`;
  return `[PreConstruction] ${proj} — ${task} update`;
}

/** HTML email mirroring the WhatsApp message structure. */
export function buildPreconNotifyEmailHtml(ctx) {
  const {
    kind,
    projectName,
    phaseName,
    taskName,
    author,
    text,
    nextAction,
    nextActionDate,
    fileLabels = [],
    attachmentLinks = []
  } = ctx;
  const openUrl = `${PUBLIC_ORIGIN()}/preconstruction/`;

  let bodyBlock = '';
  if (kind === 'activity') {
    const files =
      fileLabels.length > 0
        ? `<ul style="margin:8px 0 0;padding-left:18px">${fileLabels.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
        : '';
    bodyBlock = `
      <p style="margin:0 0 6px;font-size:13px;color:#55504a"><strong>${escapeHtml(author || 'Team')}</strong> added file(s)</p>
      ${files}`;
  } else if (kind === 'status') {
    bodyBlock = `
      <p style="margin:0 0 6px;font-size:13px;color:#55504a"><strong>${escapeHtml(author || 'Team')}</strong> updated activity status</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#1a304a">${escapeHtml(text || '—')}</p>`;
  } else {
    const files =
      fileLabels.length > 0
        ? `<p style="margin:12px 0 0;font-size:13px"><strong>Attachments (${fileLabels.length}):</strong><br/>${fileLabels.map((l) => escapeHtml(l)).join('<br/>')}</p>`
        : '';
    bodyBlock = `
      <p style="margin:0 0 6px;font-size:13px;color:#55504a"><strong>${escapeHtml(author || 'Team')}</strong></p>
      <p style="margin:0 0 12px;font-size:14px">${escapeHtml(text || '—')}</p>
      <p style="margin:0;font-size:13px"><strong>Next:</strong> ${escapeHtml(nextAction || '—')}<br/>
      <strong>Due:</strong> ${escapeHtml(nextActionDate || '—')}</p>
      ${files}`;
  }

  const linkOnly = (attachmentLinks || []).filter((l) => l?.url);
  const downloadBlock =
    linkOnly.length > 0
      ? `<div style="margin:14px 0 0;font-size:13px">
          <strong>Download</strong>
          <ul style="margin:6px 0 0;padding-left:18px">${linkOnly
            .map(
              ({ label, url }) =>
                `<li><a href="${escapeHtml(url)}" style="color:#1b5e9e">${escapeHtml(label || 'File')}</a></li>`
            )
            .join('')}</ul>
        </div>`
      : '';

  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1815;line-height:1.5;max-width:640px;margin:0;padding:16px">
  <p style="margin:0 0 12px;font-size:12px;color:#6a6560;letter-spacing:0.04em;text-transform:uppercase">Golden Abodes · Project Update</p>
  <h2 style="margin:0 0 10px;font-size:20px;color:#1a304a">${escapeHtml(projectName || 'Project')}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#55504a">
    <strong>Phase:</strong> ${escapeHtml(phaseName || '—')}<br/>
    <strong>Activity:</strong> ${escapeHtml(taskName || '—')}
  </p>
  <div style="background:#f8f6f1;border-left:4px solid #1b5e9e;padding:14px 16px;border-radius:6px">
    ${bodyBlock}
    ${downloadBlock}
  </div>
  <p style="margin:20px 0 0">
    <a href="${escapeHtml(openUrl)}" style="display:inline-block;background:#1b5e9e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:600">Open PreConstruction</a>
  </p>
  <p style="margin:16px 0 0;font-size:11px;color:#96918a">Same alert as WhatsApp — reply in PreConstruction for the full thread.</p>
</body></html>`;
}
