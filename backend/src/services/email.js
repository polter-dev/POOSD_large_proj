const sgMail = require("@sendgrid/mail");

async function send(to, subject, link) {
  // No key means local dev: log the link so register works without a SendGrid account.
  if (!process.env.SENDGRID_API_KEY) return console.log(`[email] ${subject} ${to}: ${link}`);
  if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM is not set");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({ to, from: process.env.EMAIL_FROM, subject, text: `${subject}: ${link}` });
}

async function sendVerificationEmail({ to, token }) {
  await send(to, "Verify your email", `${process.env.CLIENT_URL}/verify-email?token=${token}`);
}

async function sendResetEmail({ to, token }) {
  await send(to, "Reset your password", `${process.env.CLIENT_URL}/reset-password?token=${token}`);
}

module.exports = { sendVerificationEmail, sendResetEmail };
