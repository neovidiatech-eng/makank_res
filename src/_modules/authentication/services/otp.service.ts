import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OTPType } from '@prisma/client';
import { generateRandomNumberString } from 'src/globals/helpers/generate-random-numbers';
import { EmailService } from 'src/globals/services/email.service';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class OTPService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async generateOTP(
    userId: Id,
    type: OTPType,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ) {
    const code = env('DEFAULT_OTP')
      ? env('DEFAULT_OTP')
      : generateRandomNumberString();
    const otp = await prisma.oTP.findFirst({
      where: { userId, type },
      select: { createdAt: true, generatedTimes: true },
    });
    const dbOtp = await prisma.oTP.upsert({
      where: {
        userId_type: {
          userId,
          type,
        },
      },
      update: {
        code,
        token: null,
        type,
        generatedTimes: { increment: 1 },
        createdAt: otp?.generatedTimes <= 3 ? new Date() : undefined,
      },
      create: { userId, code, type },
      select: {
        User: { select: { email: true } },
      },
    });
    if (!env('DEFAULT_OTP')) {
      if (dbOtp.generatedTimes > 2)
        throw new BadRequestException('auth.errors.limitExceeded');
      await this.emailService.sendEmailWithTemplate(
        dbOtp.User.email,
        'otp',
        { code },
        'Your OTP Code',
      );
    }
    return code;
  }

  async verifyOTP(
    userId: Id,
    code: string,
    type: OTPType,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ) {
    const otp = await prisma.oTP.findUnique({
      where: {
        userId_type: {
          userId,
          type,
        },
        code,
        type,
        createdAt: { lte: new Date(Date.now() + +env('OTP_IGNORE_TIME')) },
      },
    });

    if (!otp) throw new UnprocessableEntityException('invalidOTP');
    await prisma.oTP.delete({ where: { id: otp.id } });
  }

  async verifyOTPAndReturnToken(
    userId: Id,
    code: string,
    type: OTPType,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ) {
    const otp = await prisma.oTP.findUnique({
      where: {
        userId_type: {
          userId,
          type,
        },
        code,
        type,
        createdAt: { lte: new Date(Date.now() + +env('OTP_IGNORE_TIME')) },
      },
    });

    if (!otp) throw new UnprocessableEntityException('invalidOTP');
    await prisma.oTP.delete({ where: { id: otp.id } });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    await this.prisma.$connect();
    await this.prisma.oTP.deleteMany({
      where: {
        createdAt: {
          lte: new Date(Date.now() - +env('OTP_IGNORE_TIME')),
        },
      },
    });
  }
}
