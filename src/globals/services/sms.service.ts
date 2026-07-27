import { Injectable } from '@nestjs/common';

@Injectable()
export class SMSService {
  constructor() {}
  async sendSMS(phone: string, message: string) {
    // eslint-disable-next-line no-console
    console.log(`Sending SMS to ${phone} with message: ${message}`);
  }
}
