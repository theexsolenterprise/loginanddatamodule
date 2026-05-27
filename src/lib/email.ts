/**
 * Email delivery via Gmail SMTP + OAuth2 refresh token.
 *
 * Setup:
 *   1. Use the same OAuth client you created for sign-in (AUTH_GOOGLE_ID/SECRET).
 *   2. Visit https://developers.google.com/oauthplayground/
 *   3. Settings (⚙) → "Use your own OAuth credentials" → paste client_id + secret.
 *   4. Pick scope:  https://mail.google.com/
 *   5. Authorize → "Exchange authorization code for tokens" → copy `refresh_token`.
 *   6. Put it in env as GMAIL_REFRESH_TOKEN, with GMAIL_SENDER = your gmail address.
 *
 * After that, this module can send mail forever without you touching it again.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { google } from "googleapis";

let _transporter: Transporter | null = null;

function isConfigured() {
  return Boolean(
    process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_SENDER,
  );
}

async function getTransporter(): Promise<Transporter | null> {
  if (!isConfigured()) return null;
  if (_transporter) return _transporter;

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const accessToken = (await oauth2.getAccessToken()).token ?? "";

  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_SENDER!,
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN!,
      accessToken,
    },
  });
  return _transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const t = await getTransporter();
  if (!t) {
    console.warn("[email] not configured — skipping send to", opts.to);
    return { sent: false, reason: "not_configured" };
  }
  await t.sendMail({
    from: process.env.GMAIL_SENDER!,
    to: opts.to,
    subject: opts.subject,
    text: opts.text ?? stripHtml(opts.html),
    html: opts.html,
  });
  return { sent: true };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pre-built templates the rest of the app calls.
 * ──────────────────────────────────────────────────────────────────────────── */
export function sendInvite(opts: {
  to: string;
  firstName: string;
  tempPassword: string;
  inviterName: string;
  appUrl: string;
}) {
  return sendEmail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to Quidvis`,
    html: `
      <p>Hi ${esc(opts.firstName)},</p>
      <p>${esc(opts.inviterName)} created an account for you on Quidvis.</p>
      <p>Sign in at <a href="${opts.appUrl}/login">${opts.appUrl}/login</a> with:</p>
      <ul>
        <li>Email: <code>${esc(opts.to)}</code></li>
        <li>Temporary password: <code>${esc(opts.tempPassword)}</code></li>
      </ul>
      <p>Please change your password after your first sign-in.</p>
    `,
  });
}

export function sendPasswordReset(opts: {
  to: string;
  firstName: string;
  newPassword: string;
  setBy: string;
  appUrl: string;
}) {
  return sendEmail({
    to: opts.to,
    subject: "Your Quidvis password was reset",
    html: `
      <p>Hi ${esc(opts.firstName)},</p>
      <p>${esc(opts.setBy)} reset your password.</p>
      <p>New temporary password: <code>${esc(opts.newPassword)}</code></p>
      <p>Sign in at <a href="${opts.appUrl}/login">${opts.appUrl}/login</a> and change it from Settings.</p>
    `,
  });
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]!);
}
