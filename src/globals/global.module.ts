import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { join } from 'path';
import { LanguagesService } from 'src/_modules/languages/languages.service';
import { MediaService } from 'src/_modules/media/services/media.service';
import { AfkBreakService } from './services/afk-break.service';
import { EmailService } from './services/email.service';
import { MapService } from './services/map.service';
import { ModelHelperService } from './services/modelHelper.service';
import { PrismaService } from './services/prisma.service';
import { ResponseService } from './services/response.service';
import { NotificationService } from './services/notification.service';
import { PrivateSettingService } from './services/settings.service';
import { SMSService } from './services/sms.service';

@Global()
@Module({
  imports: [
    // Use forRootAsync so the SMTP credentials are read inside a factory that
    // runs during Nest's DI bootstrap — i.e. AFTER dotenv has populated
    // process.env. With the eager forRoot() the env() calls were evaluated at
    // module-import time (before .env was loaded), leaving host/user/pass
    // undefined and silently breaking all outgoing mail (incl. OTP emails).
    MailerModule.forRootAsync({
      useFactory: () => {
        const port = +env('MAIL_PORT') || 587;
        return {
          transport: {
            host: env('MAIL_HOST'),
            port,
            // 465 = implicit TLS; 587/25 = STARTTLS (secure must be false).
            secure: port === 465,
            auth: {
              user: env('MAIL_USER'),
              pass: env('MAIL_PASSWORD'),
            },
            // By default nodemailer validates the cert against MAIL_HOST, which
            // is correct as long as MAIL_HOST matches the cert (use the bare
            // domain makanak-app.com, not the mail.* subdomain — its cert SAN
            // only covers makanak-app.com). Only override the name used for cert
            // validation when MAIL_TLS_SERVERNAME is explicitly set (e.g. when a
            // host must be reached by a name its cert doesn't cover).
            ...(env('MAIL_TLS_SERVERNAME')
              ? { tls: { servername: env('MAIL_TLS_SERVERNAME') } }
              : {}),
          },
          defaults: {
            from: `"Makanak" <${env('SENDER_EMAIL')}>`,
          },
          template: {
            dir: join(__dirname, '../../templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],

  providers: [
    ResponseService,
    PrismaService,
    SMSService,
    MapService,
    EmailService,
    ModelHelperService,
    LanguagesService,
    MediaService,
    PrivateSettingService,
    AfkBreakService,
    NotificationService,
  ],
  exports: [
    ResponseService,
    PrismaService,
    SMSService,
    MapService,
    EmailService,
    ModelHelperService,
    LanguagesService,
    MediaService,
    PrivateSettingService,
    AfkBreakService,
    NotificationService,
  ],
})
export class GlobalModule {
  constructor() {
    if (env('NOTIFICATIONS')) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env('FIREBASE_PROJECT_ID'),
          clientEmail: env('FIREBASE_CLIENT_EMAIL'),
          privateKey: env('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
}
