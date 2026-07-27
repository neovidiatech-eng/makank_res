/**
 * End-to-end test of the REAL app mail path: MailerModule.forRootAsync (same
 * factory as global.module.ts) + HandlebarsAdapter rendering the actual
 * src/templates/otp.hbs + EmailService.sendEmailWithTemplate. This proves the
 * production code path works, not just raw SMTP.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-mailer-nest.ts [recipient]
 */
import '../src/declares/functions/env'; // registers global env() helper
import { config } from 'dotenv';
config({ path: '.env', override: true });

declare function env(key: string): string | undefined;

import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import { EmailService } from '../src/globals/services/email.service';

const TO = process.argv[2] || 'melamrosy72@gmail.com';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => {
        const port = +env('MAIL_PORT') || 587;
        return {
          transport: {
            host: env('MAIL_HOST'),
            port,
            secure: port === 465,
            auth: { user: env('MAIL_USER'), pass: env('MAIL_PASSWORD') },
            tls: {
              servername: env('MAIL_TLS_SERVERNAME') || 'makanak-app.com',
            },
          },
          defaults: { from: `"Makanak" <${env('SENDER_EMAIL')}>` },
          template: {
            // mirror global.module.ts: templates live next to the source tree
            dir: join(__dirname, '../src/templates'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  providers: [EmailService],
})
class TestMailModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(TestMailModule, {
    logger: ['error', 'warn', 'log'],
  });
  const email = app.get(EmailService);

  console.log(`Sending OTP template email to ${TO} ...`);
  await email.sendEmailWithTemplate(TO, 'otp', { code: '7788' }, 'Your OTP Code');
  console.log('✓ sendEmailWithTemplate completed without error');

  await app.close();
}

main().catch((err) => {
  console.error('\n✗ FAILED:', err?.message);
  if (err?.code) console.error('  code:', err.code);
  if (err?.response) console.error('  response:', err.response);
  process.exit(1);
});
