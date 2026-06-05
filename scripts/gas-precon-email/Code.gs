/**
 * Golden Abodes — PreConstruction email relay (deploy as Web App).
 *
 * Setup:
 * 1. script.google.com → New project → paste this file
 * 2. Project Settings → Script properties → PRECON_EMAIL_SECRET = random string (copy for Render)
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me (use notifications@goldenabodes.com or your sender account)
 *    - Who has access: Anyone
 * 4. On Render set:
 *    PRECON_GAS_EMAIL_URL = Web App URL
 *    PRECON_GAS_EMAIL_SECRET = same secret
 */

function emailSecret_() {
  return PropertiesService.getScriptProperties().getProperty('PRECON_EMAIL_SECRET') || '';
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet() {
  return jsonOut_({ ok: true, service: 'ga-precon-email', version: 1 });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = emailSecret_();
    if (!expected || String(body.secret || '') !== expected) {
      return jsonOut_({ ok: false, error: 'Unauthorized' });
    }

    const to = (body.to || [])
      .map(function (x) {
        return String(x || '').trim().toLowerCase();
      })
      .filter(function (x) {
        return x.indexOf('@') > 0;
      });
    if (!to.length) return jsonOut_({ ok: false, error: 'No recipients' });

    const subject = String(body.subject || 'PreConstruction update');
    const text = String(body.text || '');
    const html = String(body.html || text);
    const name = String(body.fromName || 'Golden Abodes PreConstruction');

    const blobs = (body.attachments || [])
      .map(function (a) {
        if (!a || !a.contentBase64) return null;
        try {
          var bytes = Utilities.base64Decode(a.contentBase64);
          return Utilities.newBlob(
            bytes,
            String(a.contentType || 'application/octet-stream'),
            String(a.filename || 'attachment')
          );
        } catch (err) {
          return null;
        }
      })
      .filter(function (b) {
        return !!b;
      });

    var opts = { htmlBody: html, name: name };
    if (blobs.length) opts.attachments = blobs;

    GmailApp.sendEmail(to.join(','), subject, text || ' ', opts);

    return jsonOut_({ ok: true, sentTo: to, via: 'gas-gmail' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
