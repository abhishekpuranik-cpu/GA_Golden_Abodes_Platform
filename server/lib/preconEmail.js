import nodemailer from 'nodemailer';



const MAX_EMAIL_ATTACH_BYTES = Math.min(

  25,

  Math.max(5, Number(process.env.PRECON_EMAIL_MAX_MB || 15))

) * 1024 * 1024;



const SMTP_SEND_TIMEOUT_MS = 18_000;

const HTTP_SEND_TIMEOUT_MS = 25_000;



function smtpConfigured() {

  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

}



function gasEmailConfigured() {

  return !!(process.env.PRECON_GAS_EMAIL_URL || process.env.GAS_EMAIL_WEBAPP_URL);

}



function resendConfigured() {

  return !!String(process.env.RESEND_API_KEY || '').trim();

}



function smtpPass() {

  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '');

}



function smtpHost() {

  return String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();

}



function defaultSmtpPort(host) {

  if (process.env.SMTP_PORT) return Number(process.env.SMTP_PORT);

  if (/gmail\.com|google\.com/i.test(host)) return 465;

  return 587;

}



function transportProfiles() {

  const host = smtpHost();

  const preferred = defaultSmtpPort(host);

  const profiles = [];

  if (preferred === 465) {

    profiles.push({ host, port: 465, secure: true, requireTLS: false });

    profiles.push({ host, port: 587, secure: false, requireTLS: true });

  } else {

    profiles.push({ host, port: preferred, secure: false, requireTLS: true });

    profiles.push({ host, port: 465, secure: true, requireTLS: false });

  }

  return profiles;

}



function createTransport(profile) {

  return nodemailer.createTransport({

    host: profile.host,

    port: profile.port,

    secure: profile.secure,

    requireTLS: profile.requireTLS,

    auth: { user: process.env.SMTP_USER, pass: smtpPass() },

    connectionTimeout: 8_000,

    greetingTimeout: 8_000,

    socketTimeout: 12_000,

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

    return `SMTP timed out from Render to ${profile.host}:${profile.port}. Use PRECON_GAS_EMAIL_URL (Google Apps Script relay) — see scripts/gas-precon-email/Code.gs`;

  }

  if (base.toLowerCase().includes('invalid login') || base.toLowerCase().includes('authentication')) {

    return `SMTP login failed for ${process.env.SMTP_USER}. Use a Google App password in SMTP_PASS.`;

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

      return { ok: true, via: `smtp:${profile.host}:${profile.port}` };

    } catch (err) {

      lastErr = err;

      if (!isRetryableSmtpError(err) || i === profiles.length - 1) {

        throw new Error(formatSmtpError(err, profile));

      }

      console.warn(`[precon-email] SMTP retry ${profiles[i + 1].port}: ${err?.message || err}`);

    } finally {

      transport.close();

    }

  }

  throw new Error(formatSmtpError(lastErr, profiles[profiles.length - 1]));

}



function buildAttachmentPayload(attachments) {

  let total = 0;

  const out = [];

  for (const a of attachments || []) {

    const size = a.content?.length || 0;

    if (size > MAX_EMAIL_ATTACH_BYTES) {

      out.push({

        filename: `${a.filename} (too large — open in PreConstruction)`.slice(0, 120),

        contentType: 'text/plain',

        contentBase64: Buffer.from(

          `File available in PreConstruction (${Math.round(size / 1024)} KB).`,

          'utf8'

        ).toString('base64')

      });

      continue;

    }

    total += size;

    if (total > MAX_EMAIL_ATTACH_BYTES * 3) break;

    out.push({

      filename: a.filename,

      contentType: a.contentType || 'application/octet-stream',

      contentBase64: Buffer.isBuffer(a.content) ? a.content.toString('base64') : ''

    });

  }

  return out;

}



async function httpPostJson(url, payload) {

  const ctrl = new AbortController();

  const timer = setTimeout(() => ctrl.abort(), HTTP_SEND_TIMEOUT_MS);

  try {

    const res = await fetch(url, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload),

      signal: ctrl.signal

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      return { ok: false, error: data?.error || data?.message || `HTTP ${res.status}` };

    }

    return data;

  } catch (err) {

    const msg = err?.name === 'AbortError' ? 'Email relay timed out' : err?.message || String(err);

    return { ok: false, error: msg };

  } finally {

    clearTimeout(timer);

  }

}



/** Google Apps Script → GmailApp (works when Render SMTP to Gmail times out). */

async function sendViaGas(opts) {

  const url = String(process.env.PRECON_GAS_EMAIL_URL || process.env.GAS_EMAIL_WEBAPP_URL || '').trim();

  if (!url) return null;



  const to = [...new Set((opts.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

  if (!to.length) return { ok: false, error: 'No recipient email addresses' };



  const data = await httpPostJson(url, {

    secret: process.env.PRECON_GAS_EMAIL_SECRET || '',

    to,

    subject: opts.subject,

    text: opts.text || '',

    html: opts.html || opts.text || '',

    fromName: process.env.PRECON_NOTIFY_FROM_NAME || 'Golden Abodes PreConstruction',

    attachments: buildAttachmentPayload(opts.attachments)

  });



  if (!data.ok) return { ok: false, error: data.error || 'GAS email failed' };

  return { ok: true, sentTo: data.sentTo || to, via: data.via || 'gas-gmail' };

}



async function sendViaResend(opts) {

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();

  if (!apiKey) return null;



  const from =

    process.env.PRECON_NOTIFY_FROM ||

    process.env.RESEND_FROM ||

    process.env.SMTP_FROM ||

    process.env.SMTP_USER;

  const to = [...new Set((opts.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

  if (!to.length) return { ok: false, error: 'No recipient email addresses' };



  const attachments = buildAttachmentPayload(opts.attachments).map((a) => ({

    filename: a.filename,

    content: a.contentBase64

  }));



  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_SEND_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        attachments: attachments.length ? attachments : undefined
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || data?.error || `Resend failed (${res.status})` };
    return { ok: true, sentTo: to, via: 'resend' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }

}



export function emailNotifyEnabled() {

  return gasEmailConfigured() || resendConfigured() || smtpConfigured();

}



export function emailTransportHint() {

  if (gasEmailConfigured()) return 'gas';

  if (resendConfigured()) return 'resend';

  if (smtpConfigured()) return 'smtp';

  return 'none';

}



export async function sendPreconNotification(opts) {

  const to = [...new Set((opts.to || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

  if (!to.length) return { ok: false, error: 'No recipient email addresses' };



  const from =

    process.env.PRECON_NOTIFY_FROM ||

    process.env.SMTP_FROM ||

    process.env.SMTP_USER;



  const mailOpts = {

    from,

    to,

    subject: opts.subject,

    text: opts.text || '',

    html: opts.html || opts.text || '',

    attachments: (opts.attachments || []).slice(0, 12)

  };



  const gasResult = await sendViaGas({ ...opts, to });

  if (gasResult) return gasResult;



  const resendResult = await sendViaResend({ ...opts, to });

  if (resendResult) return resendResult;



  if (!smtpConfigured()) {

    return {

      ok: false,

      error:

        'Email not configured. Set PRECON_GAS_EMAIL_URL (recommended) or SMTP_* / RESEND_API_KEY on Render.'

    };

  }



  try {

    const sent = await deliverMail(mailOpts);

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


