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

export function whatsappMediaPublicUrl(attId) {
  const token = signWhatsAppMediaToken(attId);
  return `${PUBLIC_ORIGIN()}/api/preconstruction/attachments/${encodeURIComponent(attId)}/wa-media?token=${encodeURIComponent(token)}`;
}

function buildWhatsAppBody(ctx) {
  const { kind, projectName, phaseName, taskName, author, text, nextAction, nextActionDate, fileLabels = [] } =
    ctx;
  const lines = [
    '*Golden Abodes · PreConstruction*',
    `*${projectName || 'Project'}*`,
    `Phase: ${phaseName || '—'}`,
    `Activity: ${taskName || '—'}`,
    ''
  ];
  if (kind === 'activity') {
    lines.push(`📎 ${author || 'Team'} added file(s):`);
    fileLabels.forEach((l) => lines.push(`• ${l}`));
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
  lines.push('');
  lines.push(`Open: ${PUBLIC_ORIGIN()}/preconstruction/`);
  return lines.join('\n').slice(0, 1600);
}

/**
 * @param {{ toPhones: string[], body?: string, ctx?: object, mediaUrls?: string[] }} opts
 */
export async function sendWhatsAppNotifications(opts) {
  if (!whatsappConfigured()) {
    return { ok: false, error: 'WhatsApp not configured (Twilio env vars)' };
  }
  const phones = [...new Set((opts.toPhones || []).filter(Boolean))];
  if (!phones.length) return { ok: false, error: 'No WhatsApp phone numbers' };

  const body = opts.body || buildWhatsAppBody(opts.ctx || {});
  const mediaUrls = (opts.mediaUrls || []).filter(Boolean).slice(0, 5);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = normalizeWhatsAppFrom(process.env.TWILIO_WHATSAPP_FROM);
  if (!from) {
    return { ok: false, error: 'TWILIO_WHATSAPP_FROM invalid — use whatsapp:+14155238886' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const sent = [];
  const errors = [];

  for (const to of phones) {
    try {
      const params = new URLSearchParams();
      params.set('From', from);
      params.set('To', to);
      params.set('Body', body);
      mediaUrls.forEach((url) => params.append('MediaUrl', url));

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
        errors.push({ to, error: `${errMsg}${code}`, code: data.code });
        console.error('[precon-whatsapp] Twilio error:', to, errMsg, data.code || '');
      } else {
        sent.push(to);
        console.log('[precon-whatsapp] sent:', to, data.sid || '');
      }
    } catch (e) {
      errors.push({ to, error: e?.message || String(e) });
    }
  }

  return {
    ok: sent.length > 0,
    sent,
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
