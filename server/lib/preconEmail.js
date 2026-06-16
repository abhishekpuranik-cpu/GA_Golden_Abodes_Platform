import {
  emailNotifyEnabled,
  emailTransportHint,
  getEmailConfig,
  logEmailDelivery,
  sendTransactionalEmail
} from './preconEmailTransport.js';

export { emailNotifyEnabled, emailTransportHint, getEmailConfig, logEmailDelivery };

export async function sendPreconNotification(opts) {
  const result = await sendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments
  });
  if (result.ok) {
    return { ok: true, sentTo: result.sentTo, via: result.via, messageId: result.messageId };
  }
  return { ok: false, error: result.error || 'Email failed' };
}

export function buildCommentEmailHtml(ctx) {
  const {
    projectName,
    phaseName,
    taskName,
    author,
    text,
    nextAction,
    nextActionDate,
    attachmentLabels = []
  } = ctx;

  const files =
    attachmentLabels.length > 0
      ? `<p><strong>Attachments:</strong> ${attachmentLabels.map((l) => escapeHtml(l)).join(', ')}</p>`
      : '';

  return `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1815;line-height:1.5;max-width:640px">
  <p style="margin:0 0 12px;font-size:13px;color:#6a6560">Golden Abodes · PreConstruction</p>
  <h2 style="margin:0 0 8px;font-size:18px;color:#1a304a">${escapeHtml(projectName)}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#55504a">
    <strong>Phase:</strong> ${escapeHtml(phaseName)}<br/>
    <strong>Activity:</strong> ${escapeHtml(taskName)}
  </p>
  <div style="background:#f8f6f1;border-left:4px solid #1b5e9e;padding:12px 14px;border-radius:6px">
    <p style="margin:0 0 6px;font-size:12px;color:#96918a"><strong>${escapeHtml(author || 'Team')}</strong> posted an update</p>
    <p style="margin:0;font-size:14px">${escapeHtml(text || '')}</p>
  </div>
  <p style="margin:14px 0 0;font-size:13px">
    <strong>Next action:</strong> ${escapeHtml(nextAction || '—')}<br/>
    <strong>Due:</strong> ${escapeHtml(nextActionDate || '—')}
  </p>
  ${files}
  <p style="margin:20px 0 0;font-size:11px;color:#96918a">Reply in the PreConstruction Command Centre for the full thread and files.</p>
</body></html>`;
}

export function buildActivityFileEmailHtml(ctx) {
  const { projectName, phaseName, taskName, author, fileLabels = [] } = ctx;
  const files =
    fileLabels.length > 0
      ? `<ul style="margin:8px 0 0;padding-left:18px">${fileLabels.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      : '';

  return `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1815;line-height:1.5;max-width:640px">
  <p style="margin:0 0 12px;font-size:13px;color:#6a6560">Golden Abodes · PreConstruction</p>
  <h2 style="margin:0 0 8px;font-size:18px;color:#1a304a">${escapeHtml(projectName)}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#55504a">
    <strong>Phase:</strong> ${escapeHtml(phaseName)}<br/>
    <strong>Activity:</strong> ${escapeHtml(taskName)}
  </p>
  <div style="background:#f8f6f1;border-left:4px solid #c89a3a;padding:12px 14px;border-radius:6px">
    <p style="margin:0 0 6px;font-size:12px;color:#96918a"><strong>${escapeHtml(author || 'Team')}</strong> added file(s) to this activity</p>
    ${files}
  </div>
  <p style="margin:20px 0 0;font-size:11px;color:#96918a">Open the activity in PreConstruction for the full file set and comment thread.</p>
</body></html>`;
}

export function buildStatusEmailHtml(ctx) {
  const { projectName, phaseName, taskName, author, text } = ctx;
  return `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1815;line-height:1.5;max-width:640px">
  <p style="margin:0 0 12px;font-size:13px;color:#6a6560">Golden Abodes · PreConstruction</p>
  <h2 style="margin:0 0 8px;font-size:18px;color:#1a304a">${escapeHtml(projectName)}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#55504a">
    <strong>Phase:</strong> ${escapeHtml(phaseName)}<br/>
    <strong>Activity:</strong> ${escapeHtml(taskName)}
  </p>
  <div style="background:#f8f6f1;border-left:4px solid #9a6e20;padding:12px 14px;border-radius:6px">
    <p style="margin:0 0 6px;font-size:12px;color:#96918a"><strong>${escapeHtml(author || 'Team')}</strong> updated status</p>
    <p style="margin:0;font-size:14px">${escapeHtml(text || '')}</p>
  </div>
  <p style="margin:20px 0 0;font-size:11px;color:#96918a">Open PreConstruction for the full schedule and comment thread.</p>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
