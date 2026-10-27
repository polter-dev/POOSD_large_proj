const { test } = require("node:test");
const assert = require("node:assert");
const sgMail = require("@sendgrid/mail");
const { sendVerificationEmail, sendResetEmail } = require("../../src/services/email");

test("verify and reset emails send CLIENT_URL links with the token via SendGrid", async () => {
  Object.assign(process.env, { SENDGRID_API_KEY: "SG.test", EMAIL_FROM: "from@x.com", CLIENT_URL: "http://app" });
  const sent = [];
  sgMail.send = async (msg) => sent.push(msg);

  await sendVerificationEmail({ to: "a@x.com", token: "abc" });
  await sendResetEmail({ to: "b@x.com", token: "def" });

  assert.strictEqual(sent[0].to, "a@x.com");
  assert.strictEqual(sent[0].from, "from@x.com");
  assert.match(sent[0].text, /http:\/\/app\/verify-email\?token=abc/);
  assert.strictEqual(sent[1].to, "b@x.com");
  assert.match(sent[1].text, /http:\/\/app\/reset-password\?token=def/);
  process.env.EMAIL_FROM = "";
  await assert.rejects(sendResetEmail({ to: "c@x.com", token: "ghi" }), { message: "EMAIL_FROM is not set" });
});
