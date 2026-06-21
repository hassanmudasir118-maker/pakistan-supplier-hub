const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends an email if SMTP is configured. If not, logs the content to the
 * server console so auth flows (verification, reset) still work end-to-end
 * during local development/testing without requiring a mail account yet.
 */
async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log('\n──────── [DEV MODE: no SMTP configured — email not actually sent] ────────');
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    console.log('────────────────────────────────────────────────────────────────────────\n');
    return { simulated: true };
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || 'Pakistan Supplier Hub <no-reply@pakistansupplierhub.com>',
    to,
    subject,
    html,
    text,
  });
}

function verificationEmailHtml(name, link) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2>Welcome to Pakistan Supplier Hub, ${name}</h2>
    <p>Please confirm your email address to activate your account.</p>
    <p><a href="${link}" style="background:#1F3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Verify my email</a></p>
    <p>Or paste this link into your browser:<br>${link}</p>
    <p>This link expires in 24 hours.</p>
  </div>`;
}

function resetEmailHtml(name, link) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2>Password reset request</h2>
    <p>Hi ${name}, click below to set a new password. If you didn't request this, you can ignore this email.</p>
    <p><a href="${link}" style="background:#1F3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Reset my password</a></p>
    <p>This link expires in 1 hour.</p>
  </div>`;
}

module.exports = { sendEmail, verificationEmailHtml, resetEmailHtml };
