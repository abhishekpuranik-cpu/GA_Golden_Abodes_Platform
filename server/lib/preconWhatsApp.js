import crypto from 'crypto';

const PUBLIC_ORIGIN = () =>
  String(process.env.PUBLIC_APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'https://ga-golden-abodes-platform.onrender.com').replace(
    /\/$/,
    ''
  );

function mediaSecret() {
  return process.env.PRECON_WA_MEDIA_SECRET || process.env.SMTP_PASS || 'precon-wa-media-dev';
}

export function whatsappConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

/** E.164 for Twilio WhatsApp (default India +91 if 10 digits). */
export function normalizeWhatsAppPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return `whatsapp:+${digits}`;
}

/** Twilio requires From like whatsapp:+14155238886 (not bare +141…). */
export function normalizeWhatsAppFrom(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('whatsapp:')) return s;
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return `whatsapp:+${digits}`;
}

export function signWhatsAppMediaToken(attId, ttlMs = 60 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `${attId}:${exp}`;
  const sig = crypto.createHmac('sha256', mediaSecret()).update(payload).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyWhatsAppMediaToken(attId, token) {
  try {
    const [exp, sig] = String(token || '').split('.');
    if (!exp || !sig || Date.now() > Number(exp)) return false;
    const payload = `${attId}:${exp}`;
    const expect = crypto.createHmac('sha256', mediaSecret()).update(payload).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expect, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Public signed URL Twilio fetches when delivering media (default 24h). */
export function whatsappMediaPublicUrl(attId, ttlMs = 24 * 60 * 60 * 1000) {
  const token = signWhatsAppMediaToken(attId, ttlMs);
  return `${PUBLIC_ORIGIN()}/api/preconstruction/attachments/${encodeURIComponent(attId)}/wa-media?token=${encodeURIComponent(token)}`;
}

/** MIME types Twilio WhatsApp can attach (one file per message). */
export function whatsappSendableMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (!m) return false;
  if (m.startsWith('image/') || m.startsWith('video/') || m === 'application/pdf') return true;
  return (
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.ms-powerpoint' ||
    m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

function buildWhatsAppBody(ctx) {
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
    '*Golden Abodes · Project Update*',
    `*${projectName || 'Project'}*`,
    `Phase: ${phaseName || '—'}`,
    `Activity: ${taskName || '—'}`,
    ''
  ];
  if (kind === 'activity') {
    lines.push(`📎 ${author || 'Team'} added file(s):`);
    fileLabels.forEach((l) => lines.push(`• ${l}`));
  } else if (kind === 'status') {
    lines.push(`📊 *${author || 'Team'}* updated activity status`);
    lines.push(text || '—');
  } else {
    lines.push(`💬 *${author || 'Team'}*`);
    lines.push(text || '—');
    lines.push('');
    lines.push(`*Next:* ${nextAction || '—'}`);
    lines.push(`*Due:* ${nextActionDate || '—'}`);
    if (fileLabels.length) {
      lines.push('');
      lines.push(`📎 Attachments (${fileLabels.length}):`);
      fileLabels.forEach((l) => lines.push(`• ${l}`));
    }
  }
  const linkOnly = (attachmentLinks || []).filter((l) => l?.url && !l.asMedia);
  if (linkOnly.length) {
    lines.push('');
    lines.push('📎 *Download:*');
    linkOnly.forEach(({ label, url }) => {
      lines.push(`• ${label || 'File'}`);
      lines.push(url);
    });
  }
  lines.push('');
  lines.push(`Open: ${PUBLIC_ORIGIN()}/preconstruction/`);
  return lines.join('\n').slice(0, 1600);
}

async function postTwilioMessage({ sid, auth, from, to, body, mediaUrl }) {
  const params = new URLSearchParams();
  params.set('From', from);
  params.set('To', to);
  if (body) params.set('Body', body);
  if (mediaUrl) params.set('MediaUrl', mediaUrl);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data.message || res.statusText || `HTTP ${res.status}`;
    const code = data.code != null ? ` [${data.code}]` : '';
    return { ok: false, error: `${errMsg}${code}`, code: data.code };
  }
  return { ok: true, sid: data.sid };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{
 *   toPhones: string[],
 *   body?: string,
 *   ctx?: object,
 *   mediaUrls?: string[],
 *   mediaItems?: { url: string, label?: string }[]
 * }} opts
 */
export async function sendWhatsAppNotifications(opts) {
  if (!whatsappConfigured()) {
    return { ok: false, error: 'WhatsApp not configured (Twilio env vars)' };
  }
  const phones = [...new Set((opts.toPhones || []).filter(Boolean))];
  if (!phones.length) return { ok: false, error: 'No WhatsApp phone numbers' };

  const body = opts.body || buildWhatsAppBody(opts.ctx || {});
  const mediaItems = (opts.mediaItems?.length
    ? opts.mediaItems
    : (opts.mediaUrls || []).map((url) => ({ url }))
  )
    .filter((m) => m?.url)
    .slice(0, 8);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = normalizeWhatsAppFrom(process.env.TWILIO_WHATSAPP_FROM);
  if (!from) {
    return { ok: false, error: 'TWILIO_WHATSAPP_FROM invalid — use whatsapp:+14155238886' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const sent = [];
  const errors = [];
  let messagesSent = 0;
  let mediaSent = 0;

  for (const to of phones) {
    let phoneOk = false;
    try {
      const summary = await postTwilioMessage({ sid, auth, from, to, body, mediaUrl: null });
      if (summary.ok) {
        phoneOk = true;
        messagesSent += 1;
        console.log('[precon-whatsapp] summary sent:', to, summary.sid || '');
      } else {
        errors.push({ to, error: summary.error, kind: 'summary' });
        console.error('[precon-whatsapp] summary failed:', to, summary.error);
      }

      for (const item of mediaItems) {
        await sleep(400);
        const caption = item.label ? `📎 ${item.label}` : '📎 Attachment';
        const media = await postTwilioMessage({
          sid,
          auth,
          from,
          to,
          body: caption,
          mediaUrl: item.url
        });
        if (media.ok) {
          phoneOk = true;
          messagesSent += 1;
          mediaSent += 1;
          console.log('[precon-whatsapp] media sent:', to, item.label || '', media.sid || '');
        } else {
          errors.push({ to, error: media.error, kind: 'media', label: item.label });
          console.error('[precon-whatsapp] media failed:', to, item.label, media.error);
        }
      }

      if (phoneOk) sent.push(to);
    } catch (e) {
      errors.push({ to, error: e?.message || String(e) });
    }
  }

  return {
    ok: sent.length > 0,
    sent,
    messagesSent,
    mediaSent,
    mediaCount: mediaItems.length,
    errors,
    error: errors.length && !sent.length ? errors.map((e) => e.error).join('; ') : undefined
  };
}

export function resolvePhonesForRecipients(recipients, usersByEmail) {
  const phones = [];
  for (const r of recipients || []) {
    if (r.phone) {
      const w = normalizeWhatsAppPhone(r.phone);
      if (w) phones.push(w);
      continue;
    }
    const email = String(r.email || '').trim().toLowerCase();
    const u = usersByEmail.get(email);
    if (u?.phone) {
      const w = normalizeWhatsAppPhone(u.phone);
      if (w) phones.push(w);
    }
  }
  return [...new Set(phones)];
}
