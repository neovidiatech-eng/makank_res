import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendEmail(email: string, message: string, subject?: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: subject ? subject : 'Hello ✔',
        html: message,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${email}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  async sendEmailWithTemplate(
    email: string,
    template: string,
    context: any,
    subject?: string,
  ) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: subject || 'Notification',
        template: template,
        context: context,
      });
      this.logger.log(`Email sent to ${email} using template "${template}"`);
    } catch (error) {
      this.logger.error(
        `Failed to send "${template}" email to ${email}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
