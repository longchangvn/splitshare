// AUTO-COPIED from web/src/inviteResults.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
/**
 * Email-invite outcomes from POST /api/v1/groups/:id/invites (and the `invites`
 * block of POST /api/v1/groups) → one row per address.
 *
 * The API reports `email_sent: true` only when the email provider accepted the
 * message and returned a message id, so a row is "sent" only on that signal.
 * Responses without `results` (older API) carry no proof of delivery and are
 * reported as not sent rather than assumed successful.
 *
 * Plain JS (no JSX) so it is shared with mobile and runs under node --test.
 */
const EMAIL_STATUSES = new Set(['sent', 'failed', 'not_configured']);

export function inviteRows(response) {
  const results = Array.isArray(response?.results) ? response.results : null;
  if (results) {
    return results
      .filter((x) => x && typeof x.email === 'string')
      .map((x) => {
        const emailSent = x.email_sent === true;
        const emailStatus = emailSent ? 'sent'
          : (EMAIL_STATUSES.has(x.email_status) && x.email_status !== 'sent' ? x.email_status : 'failed');
        return {
          email: x.email,
          status: x.status === 'added' ? 'added' : 'invited',
          emailSent,
          emailStatus,
          error: emailSent ? null : (typeof x.email_error === 'string' ? x.email_error : null),
        };
      });
  }
  const legacy = (list, status) => (Array.isArray(list) ? list : [])
    .filter((email) => typeof email === 'string')
    .map((email) => ({ email, status, emailSent: false, emailStatus: 'unknown', error: null }));
  return [...legacy(response?.added, 'added'), ...legacy(response?.pending, 'invited')];
}

/** tone: success (all sent) · partial · error (none sent) · empty. */
export function inviteSummary(rows) {
  const total = rows.length;
  const sent = rows.filter((r) => r.emailSent).length;
  const failed = total - sent;
  const tone = total === 0 ? 'empty' : failed === 0 ? 'success' : sent === 0 ? 'error' : 'partial';
  return { total, sent, failed, tone };
}

/** i18n key + vars for the summary toast/title. */
export function inviteSummaryMessage(summary) {
  if (summary.tone === 'success') return { key: 'invite.resultAllSent', vars: { count: summary.total } };
  if (summary.tone === 'partial') return { key: 'invite.resultSomeFailed', vars: { sent: summary.sent, total: summary.total } };
  return { key: 'invite.resultNoneSent', vars: {} };
}

/** i18n key for one row, plus the detail key/text explaining a failed send. */
export function inviteRowMessage(row) {
  const key = row.status === 'added'
    ? (row.emailSent ? 'invite.rowAddedSent' : 'invite.rowAddedNoEmail')
    : (row.emailSent ? 'invite.rowInvitedSent' : 'invite.rowInvitedNoEmail');
  if (row.emailSent) return { key, detailKey: null, detail: null };
  if (row.emailStatus === 'not_configured') return { key, detailKey: 'invite.emailNotConfigured', detail: null };
  if (row.emailStatus === 'unknown') return { key, detailKey: 'invite.emailUnverified', detail: null };
  return { key, detailKey: row.error ? null : 'invite.emailFailed', detail: row.error };
}
