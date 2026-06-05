import crypto from 'crypto';

import {

  buildActivityFileEmailHtml,

  buildCommentEmailHtml,

  logEmailDelivery,
  sendPreconNotification

} from './preconEmail.js';

import { getAttachmentMeta, readAttachmentBuffer } from './preconAttachments.js';

import {

  resolvePhonesForRecipients,

  sendWhatsAppNotifications,

  whatsappMediaPublicUrl

} from './preconWhatsApp.js';



const JOBS = 'precon_notify_jobs';



export function createNotifyJobId() {

  return `nj_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;

}



export async function initNotifyJob(db, jobId, meta) {

  await db.collection(JOBS).insertOne({

    _id: jobId,

    status: 'queued',

    meta,

    createdAt: new Date()

  });

}



export async function finishNotifyJob(db, jobId, result) {

  const status = result?.ok ? 'sent' : 'failed';

  await db.collection(JOBS).updateOne(

    { _id: jobId },

    {

      $set: {

        status,

        result,

        error: result?.ok ? '' : result?.error || 'Notify failed',

        finishedAt: new Date()

      }

    }

  );

}



export async function getNotifyJob(db, jobId) {

  return db.collection(JOBS).findOne({ _id: jobId });

}



export async function deliverPreconNotification(db, { body, sess, recipients, emails, jobId }) {

  try {

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



    await db.collection(JOBS).updateOne({ _id: jobId }, { $set: { status: 'running', startedAt: new Date() } });



    const [emailResult, waResult] = await Promise.all([

      sendPreconNotification({ to: emails, subject, text, html, attachments: emailFiles }),

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



    const result = {

      ok: !!emailResult.ok || !!(waResult.ok && (waResult.sent?.length || 0)),

      ...emailResult,

      recipients,

      recipientCount: emails.length,

      whatsapp: waResult,

      whatsappCount: waResult.sent?.length || 0

    };

    if (!emailResult.ok) {

      result.error = emailResult.error;

      console.error('[precon-notify] email failed:', emailResult.error);

    }

    await logEmailDelivery(db, {
      jobId,
      kind,
      projectId: body.projectId,
      taskName: body.taskName,
      provider: emailResult.via || null,
      ok: !!emailResult.ok,
      error: emailResult.error || '',
      recipientCount: emails.length,
      messageId: emailResult.messageId || null
    });

    await finishNotifyJob(db, jobId, result);

    return result;

  } catch (err) {

    const result = { ok: false, error: err?.message || String(err) };

    await finishNotifyJob(db, jobId, result);

    throw err;

  }

}


