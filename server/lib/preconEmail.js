import nodemailer from 'nodemailer';

const MAX_EMAIL_ATTACH_BYTES = Math.min(
  25,
  Math.max(5, Number(process.env.PRECON_EMAIL_MAX_MB || 15))
) * 1024 * 1024;

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

export function emailNotifyEnabled() {
  return smtpConfigured();
}

/**
 * @param {object} opts
 * @param {string[]} opts.to - recipient emails
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {{ filename: string, content: Buffer, contentType?: string }[]} [opts.attachments]
 */
export async function sendPreconNotification(opts) {
  if (!smtpConfigured()) {
    return { ok: false, error: 'Email not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS on server)' };
  }
  const to = [...new Set((opts.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return { ok: false, error: 'No recipient email addresses' };

  const from =
    process.env.PRECON_NOTIFY_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER;

  let total = 0;
  const attachments = [];
  for (const a of opts.attachments || []) {
    const size = a.content?.length || 0;
    if (size > MAX_EMAIL_ATTACH_BYTES) {
      attachments.push({
        filename: `${a.filename} (too large for email — open in PreConstruction)`.slice(0, 120),
        content: Buffer.from(
          `This file (${Math.round(size / 1024)} KB) is available in the PreConstruction app.`,
          'utf8'
        ),
        contentType: 'text/plain'
      });
      continue;
    }
    total += size;
    if (total > MAX_EMAIL_ATTACH_BYTES * 3) break;
    attachments.push({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType
    });
  }

  const transport = createTransport();
  await transport.sendMail({
    from,
    to: to.join(', '),
    subject: opts.subject,
    text: opts.text || '',
    html: opts.html || opts.text || '',
    attachments
  });

  return { ok: true, sentTo: to };
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

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
