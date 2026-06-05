import {
  buildActivityFileEmailHtml,
  buildCommentEmailHtml,
  sendPreconNotification
} from './preconEmail.js';
import { getAttachmentMeta, readAttachmentBuffer } from './preconAttachments.js';
import {
  resolvePhonesForRecipients,
  sendWhatsAppNotifications,
  whatsappMediaPublicUrl
} from './preconWhatsApp.js';

/**
 * Deliver email + WhatsApp for a comment/activity notify (runs in background).
 */
export async function deliverPreconNotification(db, { body, sess, recipients, emails }) {
  const kind = String(body.kind || 'comment').toLowerCase();
  const attachmentIds = [
    ...(Array.isArray(body.attachmentIds) ? body.attachmentIds : []),
    ...(Array.isArray(body.taskAttachmentIds) ? body.taskAttachmentIds : [])
  ];

  const emailFiles = [];
  const labels = [];
  for (const id of attachmentIds) {
    const loaded = await readAttachmentBuffer(db, id);
    if (!loaded) continue;
    labels.push(loaded.meta.label || loaded.meta.fileName);
    emailFiles.push({
      filename: loaded.meta.label || loaded.meta.fileName,
      content: loaded.buffer,
      contentType: loaded.meta.mimeType
    });
  }

  const author = body.author || sess.user.name;
  const isActivity = kind === 'activity';
  const html = isActivity
    ? buildActivityFileEmailHtml({
        projectName: body.projectName,
        phaseName: body.phaseName,
        taskName: body.taskName,
        author,
        fileLabels: labels
      })
    : buildCommentEmailHtml({
        projectName: body.projectName,
        phaseName: body.phaseName,
        taskName: body.taskName,
        author,
        text: body.text,
        nextAction: body.nextAction,
        nextActionDate: body.nextActionDate,
        attachmentLabels: labels
      });

  const subject = isActivity
    ? `[PreConstruction] ${body.projectName || 'Project'} — New file(s): ${body.taskName || 'Activity'}`
    : `[PreConstruction] ${body.projectName || 'Project'} — ${body.taskName || 'Activity update'}`;

  const text = isActivity
    ? `${author} added file(s) to ${body.taskName || 'activity'}: ${labels.join(', ')}`
    : `${body.text || ''}\n\nNext: ${body.nextAction || '—'} (${body.nextActionDate || '—'})`;

  const waMimeOk = (mime) => {
    const m = String(mime || '').toLowerCase();
    return m.startsWith('image/') || m === 'application/pdf' || m.startsWith('video/');
  };
  const mediaUrls = [];
  for (const id of attachmentIds) {
    const meta = await getAttachmentMeta(db, id);
    if (meta && waMimeOk(meta.mimeType)) mediaUrls.push(whatsappMediaPublicUrl(id));
  }
  const authUsers = await db
    .collection('auth_users')
    .find({ status: { $ne: 'disabled' } }, { projection: { email: 1, phone: 1 } })
    .toArray();
  const usersByEmail = new Map(authUsers.map((u) => [String(u.email || '').toLowerCase(), u]));
  const toPhones = resolvePhonesForRecipients(recipients, usersByEmail);

  const [emailResult, waResult] = await Promise.all([
    sendPreconNotification({
      to: emails,
      subject,
      text,
      html,
      attachments: emailFiles
    }),
    sendWhatsAppNotifications({
      toPhones,
      ctx: {
        kind: isActivity ? 'activity' : 'comment',
        projectName: body.projectName,
        phaseName: body.phaseName,
        taskName: body.taskName,
        author,
        text: body.text,
        nextAction: body.nextAction,
        nextActionDate: body.nextActionDate,
        fileLabels: labels
      },
      mediaUrls
    })
  ]);

  if (!emailResult.ok) {
    console.error('[precon-notify] email failed:', emailResult.error);
  }
  if (!waResult.ok && waResult.error) {
    console.warn('[precon-notify] whatsapp:', waResult.error);
  }

  return {
    ...emailResult,
    recipients,
    recipientCount: emails.length,
    whatsapp: waResult,
    whatsappCount: waResult.sent?.length || 0
  };
}
