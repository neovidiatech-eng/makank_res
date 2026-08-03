import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  OnModuleInit,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response } from 'express';
import { OrderService } from '../../order/order.service';
import { KashierService } from './kashier.service';

@Controller('kashier')
export class KashierController implements OnModuleInit {
  private readonly logger = new Logger(KashierController.name);
  private orderService: OrderService;

  constructor(
    private readonly kashierService: KashierService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    this.orderService = this.moduleRef.get(OrderService, { strict: false });
  }

  @Post('create-payment')
  async createPayment(
    @Body()
    body: {
      amount: number;
      orderId?: string;
      customerName?: string;
      customerEmail?: string;
      merchantRedirectUrl?: string;
    },
    @Res() res: Response,
  ) {
    try {
      const orderId =
        body.orderId && body.orderId !== 'null'
          ? body.orderId
          : `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const paymentUrl = this.kashierService.generatePaymentUrl({
        amount: body.amount * 100, // Convert EGP to Piasters
        orderId,
        merchantRedirectUrl:
          body.merchantRedirectUrl ||
          (env('MAIN_URL')
            ? `${env('MAIN_URL').replace(/\/$/, '')}/api/kashier/callback`
            : 'https://api-v1.makanak-app.com/api/kashier/callback'),
      });
      console.log(paymentUrl);
      return res.status(HttpStatus.OK).json({ paymentUrl, orderId });
    } catch (error) {
      this.logger.error(`Error generating payment URL: ${error.message}`);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  }

  // Kashier usually redirects back to this URL after payment
  @Get('callback')
  async handleCallback(@Query() query: any, @Res() res: Response) {
    this.logger.log(
      `Received Kashier callback query: ${JSON.stringify(query)}`,
    );

    const isSuccess = this.kashierService.verifyCallback(query);

    if (isSuccess) {
      this.logger.log(`Payment success for order ${query.orderId}`);
      await this.orderService.handleKashierSuccess(Number(query.orderId));
      return res.redirect(
        `https://your-frontend.com/payment-success?orderId=${query.orderId}`,
      );
    } else {
      this.logger.log(`Payment failed for order ${query.orderId}`);
      const orderId = Number(query.orderId);
      if (!isNaN(orderId)) {
        try {
          await this.orderService.handleKashierFailure(orderId);
        } catch (err) {
          this.logger.error(
            `Failed to process Kashier failure for order ${query.orderId}: ${err.message}`,
          );
        }
      }
      return res.redirect(
        `https://your-frontend.com/payment-failure?orderId=${query.orderId}`,
      );
    }
  }

  // Webhook for asynchronous notifications
  @Post('webhook')
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const payload = req.body;
    this.logger.log(
      `Received Kashier webhook payload: ${JSON.stringify(payload)}`,
    );

    const isSuccess = this.kashierService.verifyCallback(payload);

    if (isSuccess) {
      this.logger.log(`Webhook: Payment success for order ${payload.orderId}`);
      await this.orderService.handleKashierSuccess(Number(payload.orderId));
    } else {
      this.logger.log(`Webhook: Payment failed for order ${payload.orderId}`);
      const orderId = Number(payload.orderId);
      if (!isNaN(orderId)) {
        try {
          await this.orderService.handleKashierFailure(orderId);
        } catch (err) {
          this.logger.error(
            `Failed to process Kashier failure webhook for order ${payload.orderId}: ${err.message}`,
          );
        }
      }
    }

    return res.status(HttpStatus.OK).send('OK');
  }
}
