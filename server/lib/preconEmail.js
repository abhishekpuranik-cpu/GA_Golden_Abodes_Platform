import nodemailer from 'nodemailer';

const MAX_EMAIL_ATTACH_BYTES = Math.min(
  25,
  Math.max(5, Number(process.env.PRECON_EMAIL_MAX_MB || 15))
) * 1024 * 1024;

const SMTP_SEND_TIMEOUT_MS = 22_000;

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function smtpHost() {
  return String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
}

function transportProfiles() {
  const preferred = Number(process.env.SMTP_PORT || 587);
  const host = smtpHost();
  const profiles = [];
  if (preferred === 465) {
    profiles.push({ host, port: 465, secure: true, requireTLS: false });
  } else {
    profiles.push({ host, port: preferred, secure: false, requireTLS: true });
    if (preferred !== 465) profiles.push({ host, port: 465, secure: true, requireTLS: false });
  }
  return profiles;
}

function createTransport(profile) {
  return nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    requireTLS: profile.requireTLS,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 18_000,
    tls: { minVersion: 'TLSv1.2' },
    family: 4
  });
}

function isRetryableSmtpError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('connect') ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET'
  );
}

function formatSmtpError(err, profile) {
  const base = String(err?.message || err || 'SMTP failed');
  if (base.toLowerCase().includes('timeout') || base.toLowerCase().includes('timed out')) {
    return `SMTP connection timed out (${profile.host}:${profile.port}). Use a Google App password on ${process.env.SMTP_USER}, try SMTP_PORT=465, or allow smtp.gmail.com from your host.`;
  }
  if (base.toLowerCase().includes('invalid login') || base.toLowerCase().includes('authentication')) {
    return `SMTP authentication failed for ${process.env.SMTP_USER}. Use a 16-character Google App password (no spaces) in SMTP_PASS.`;
  }
  return base;
}

async function sendMailWithTimeout(transport, mailOpts) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('SMTP send timed out')), SMTP_SEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([transport.sendMail(mailOpts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function deliverMail(mailOpts) {
  const profiles = transportProfiles();
  let lastErr;
  for (let i = 0; i < profiles.length; i += 1) {
    const profile = profiles[i];
    const transport = createTransport(profile);
    try {
      await sendMailWithTimeout(transport, mailOpts);
      return { ok: true, via: `${profile.host}:${profile.port}` };
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableSmtpError(err);
      if (!retryable || i === profiles.length - 1) {
        throw new Error(formatSmtpError(err, profile));
      }
      console.warn(`[precon-email] retry SMTP via ${profiles[i + 1].host}:${profiles[i + 1].port} after: ${err?.message || err}`);
    } finally {
      transport.close();
    }
  }
  throw new Error(formatSmtpError(lastErr, profiles[profiles.length - 1]));
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

  try {
    const sent = await deliverMail({
      from,
      to,
      subject: opts.subject,
      text: opts.text || '',
      html: opts.html || opts.text || '',
      attachments
    });
    return { ok: true, sentTo: to, via: sent.via };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
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
