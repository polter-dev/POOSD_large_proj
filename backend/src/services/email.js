// shortcut: logs the link instead of sending, replace the body with the real transport once #49 picks SendGrid or Nodemailer

async function sendVerificationEmail({ to, token }) {
  console.log(`[email] verify ${to}: ${process.env.CLIENT_URL}/verify-email?token=${token}`);
}

async function sendResetEmail({ to, token }) {
  console.log(`[email] reset ${to}: ${process.env.CLIENT_URL}/reset-password?token=${token}`);
}

module.exports = { sendVerificationEmail, sendResetEmail };
