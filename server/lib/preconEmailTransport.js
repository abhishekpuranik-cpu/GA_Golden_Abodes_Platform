import nodemailer from 'nodemailer';

const MAX_ATTACH_BYTES = Math.min(
  25,
  Math.max(5, Number(process.env.PRECON_EMAIL_MAX_MB || 15))
) * 1024 * 1024;

const HTTP_TIMEOUT_MS = 28_000;
const SMTP_TIMEOUT_MS = 16_000;
const MAX_RETRIES = 2;

const SETUP_STEPS = [
  'Create a Resend account at https://resend.com',
  'Verify domain goldenabodes.com (add DNS SPF + DKIM records in Google Domains / Workspace admin)',
  'Create an API key and set on Render: EMAIL_PROVIDER=resend, RESEND_API_KEY=re_...',
  'Set PRECON_NOTIFY_FROM=Golden Abodes <notifications@goldenabodes.com>',
  'Redeploy — email sends over HTTPS (no SMTP timeouts from Render)'
];

function defaultFrom() {
  return (
    process.env.PRECON_NOTIFY_FROM ||
    process.env.RESEND_FROM ||
    process.env.SENDGRID_FROM ||
    process.env.SMTP_FROM ||
    (process.env.SMTP_USER ? `Golden Abodes <${process.env.SMTP_USER}>` : '')
  );
}

function normalizeRecipients(to) {
  return [...new Set((to || []).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@')))];
}

function packAttachments(attachments) {
  let total = 0;
  const out = [];
  for (const a of attachments || []) {
    const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || '');
    const size = content.length;
    if (size > MAX_ATTACH_BYTES) {
      out.push({
        filename: `${a.filename || 'file'} (see PreConstruction app)`.slice(0, 120),
        contentType: 'text/plain',
        content: Buffer.from(`Attachment available in PreConstruction (${Math.round(size / 1024)} KB).`, 'utf8')
      });
      continue;
    }
    total += size;
    if (total > MAX_ATTACH_BYTES * 3) break;
    out.push({
      filename: a.filename || 'attachment',
      contentType: a.contentType || 'application/octet-stream',
      content
    });
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(errOrResult) {
  const status = errOrResult?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const msg = String(errOrResult?.error || errOrResult?.message || '').toLowerCase();
  return msg.includes('rate') || msg.includes('timeout') || msg.includes('temporar');
}

async function httpJson(url, { method = 'POST', headers = {}, body, timeoutMs = HTTP_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Email API timed out' : err?.message || String(err);
    return { ok: false, status: 0, error: msg, data: {} };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaResend({ to, from, subject, text, html, attachments }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const packed = packAttachments(attachments);
  const res = await httpJson('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      from: from || defaultFrom(),
      to,
      subject,
      html: html || text || '',
      text: text || undefined,
      attachments: packed.length
        ? packed.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64')
          }))
        : undefined
    }
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: res.data?.message || res.data?.error || res.error || `Resend failed (${res.status})`
    };
  }
  return { ok: true, sentTo: to, provider: 'resend', messageId: res.data?.id || null };
}

async function sendViaSendGrid({ to, from, subject, text, html, attachments }) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  if (!apiKey) return null;

  const packed = packAttachments(attachments);
  const sgAttachments = packed.map((a) => ({
    content: a.content.toString('base64'),
    filename: a.filename,
    type: a.contentType,
    disposition: 'attachment'
  }));

  const res = await httpJson('https://api.sendgrid.com/v3/mail/send', {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      personalizations: [{ to: to.map((email) => ({ email })) }],
      from: { email: extractEmail(from), name: extractName(from) },
      subject,
      content: [
        { type: 'text/plain', value: text || stripHtml(html) },
        { type: 'text/html', value: html || text || '' }
      ],
      attachments: sgAttachments.length ? sgAttachments : undefined
    }
  });

  if (!res.ok) {
    const errMsg =
      res.data?.errors?.map((e) => e.message).join('; ') ||
      res.error ||
      `SendGrid failed (${res.status})`;
    return { ok: false, status: res.status, error: errMsg };
  }
  return { ok: true, sentTo: to, provider: 'sendgrid' };
}

function extractEmail(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : from || process.env.SMTP_USER || '').trim();
}

function extractName(from) {
  const s = String(from || '');
  const m = s.match(/^([^<]+)</);
  return (m ? m[1] : 'Golden Abodes').replace(/"/g, '').trim();
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function sendViaSmtp({ to, from, subject, text, html, attachments }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (process.env.EMAIL_ALLOW_SMTP !== '1') {
    return {
      ok: false,
      error:
        'SMTP disabled on Render (unreliable). Set EMAIL_PROVIDER=resend + RESEND_API_KEY, or EMAIL_ALLOW_SMTP=1 to force SMTP.'
    };
  }

  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass },
    connectionTimeout: 8_000,
    socketTimeout: SMTP_TIMEOUT_MS,
    family: 4
  });

  let timer;
  try {
    const mailPromise = transport.sendMail({
      from: from || defaultFrom(),
      to,
      subject,
      text: text || '',
      html: html || text || '',
      attachments: packAttachments(attachments)
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('SMTP timed out')), SMTP_TIMEOUT_MS);
    });
    await Promise.race([mailPromise, timeout]);
    return { ok: true, sentTo: to, provider: 'smtp' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
    transport.close();
  }
}

const PROVIDER_SENDERS = {
  resend: (opts) => sendViaResend(opts),
  sendgrid: (opts) => sendViaSendGrid(opts),
  smtp: (opts) => sendViaSmtp(opts)
};

function detectAvailableProviders() {
  const list = [];
  if (String(process.env.RESEND_API_KEY || '').trim()) list.push('resend');
  if (String(process.env.SENDGRID_API_KEY || '').trim()) list.push('sendgrid');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) list.push('smtp');
  return list;
}

export function resolveEmailProvider() {
  const forced = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const available = detectAvailableProviders();

  if (forced && PROVIDER_SENDERS[forced]) {
    if (forced === 'smtp' || available.includes(forced)) return forced;
  }

  if (available.includes('resend')) return 'resend';
  if (available.includes('sendgrid')) return 'sendgrid';
  if (available.includes('smtp') && process.env.EMAIL_ALLOW_SMTP === '1') return 'smtp';
  return null;
}

export function getEmailConfig() {
  const provider = resolveEmailProvider();
  const available = detectAvailableProviders();
  return {
    enabled: !!provider,
    provider,
    from: defaultFrom(),
    availableProviders: available,
    setupRequired: !provider,
    recommendedProvider: 'resend',
    setupSteps: SETUP_STEPS,
    smtpDeprecated: available.includes('smtp') && !available.includes('resend') && !available.includes('sendgrid')
  };
}

export function emailNotifyEnabled() {
  return !!resolveEmailProvider();
}

export function emailTransportHint() {
  return resolveEmailProvider() || 'none';
}

export async function sendTransactionalEmail(opts) {
  const to = normalizeRecipients(opts.to);
  if (!to.length) return { ok: false, error: 'No recipient email addresses' };

  const providerId = resolveEmailProvider();
  if (!providerId) {
    return {
      ok: false,
      error: 'Email not configured. Use Resend (recommended): EMAIL_PROVIDER=resend, RESEND_API_KEY, PRECON_NOTIFY_FROM on Render.'
    };
  }

  const sender = PROVIDER_SENDERS[providerId];
  const payload = {
    to,
    from: opts.from || defaultFrom(),
    subject: opts.subject,
    text: opts.text || '',
    html: opts.html || opts.text || '',
    attachments: opts.attachments || []
  };

  let last = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(800 * attempt);
    const result = await sender(payload);
    if (!result) {
      last = { ok: false, error: `Provider ${providerId} not available` };
      break;
    }
    if (result.ok) {
      return { ...result, via: result.provider || providerId };
    }
    last = result;
    if (!isRetryableError(result)) break;
  }

  return last || { ok: false, error: 'Email send failed' };
}

export async function logEmailDelivery(db, entry) {
  if (!db) return;
  try {
    await db.collection('precon_email_log').insertOne({
      ...entry,
      ts: new Date()
    });
  } catch (err) {
    console.warn('[precon-email] log failed:', err?.message || err);
  }
}
