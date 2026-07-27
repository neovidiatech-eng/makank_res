/**
 * Standalone SMTP smoke test — mirrors the transport logic in
 * src/globals/global.module.ts (post-fix). Loads .env at runtime, verifies the
 * connection, and sends a sample OTP email.
 *
 * Run: npx ts-node scripts/test-email.ts [recipient@example.com]
 */
import { config } from 'dotenv';
import * as nodemailer from 'nodemailer';

config({ path: '.env', override: true });

const TO = process.argv[2] || 'melamrosy72@gmail.com';

function mask(v?: string) {
  if (!v) return '(undefined)';
  if (v.length <= 2) return '*'.repeat(v.length);
  return v[0] + '*'.repeat(Math.max(1, v.length - 2)) + v[v.length - 1];
}

async function main() {
  const host = process.env.MAIL_HOST;
  const port = +process.env.MAIL_PORT || 587;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASSWORD;
  const from = `"Makanak" <${process.env.SENDER_EMAIL}>`;

  console.log('SMTP config resolved from .env:');
  console.log('  host        :', host || '(undefined)');
  console.log('  port        :', port, '| secure:', port === 465);
  console.log('  user        :', mask(user));
  console.log('  pass        :', mask(pass));
  console.log('  SENDER_EMAIL:', process.env.SENDER_EMAIL || '(undefined)');
  console.log('  -> sending to:', TO);
  console.log('');

  if (!host || !user || !pass) {
    console.error(
      'Missing SMTP env vars — cannot send. Fill MAIL_HOST/MAIL_USER/MAIL_PASSWORD in .env.',
    );
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // The server's TLS cert is issued for the bare domain (makanak-app.com),
    // not the mail.* subdomain we connect to. Validate against the cert's name.
    tls: { servername: process.env.MAIL_TLS_SERVERNAME || 'makanak-app.com' },
  });

  console.log('Verifying SMTP connection...');
  await transporter.verify();
  console.log('✓ SMTP connection OK\n');

  const code = '5554';
  const info = await transporter.sendMail({
    from,
    to: TO,
    subject: 'Your OTP Code (test)',
    html: `<h1>Your Verification Code</h1><p>Your one-time password is:</p>
           <div style="font-size:24px;font-weight:bold;letter-spacing:5px">${code}</div>
           <p>This is a test email from Makanak's SMTP smoke test.</p>`,
  });

  console.log('✓ Email accepted by server');
  console.log('  messageId:', info.messageId);
  console.log('  response :', info.response);
  console.log('  accepted :', info.accepted);
  console.log('  rejected :', info.rejected);
}

main().catch((err) => {
  console.error('\n✗ Email test FAILED');
  console.error('  message:', err?.message);
  if (err?.code) console.error('  code   :', err.code);
  if (err?.command) console.error('  command:', err.command);
  if (err?.response) console.error('  response:', err.response);
  process.exit(1);
});
