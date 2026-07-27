import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KashierNativeService,
  KashierOrderDto,
  KashierPaymentMethod,
  KashierPaymentMode,
  KashierSupportedCurrency,
  KashierValidatableTransactionResponseDto,
} from 'kashier-gateway';

@Injectable()
export class KashierService {
  private kashier: KashierNativeService;
  private readonly logger = new Logger(KashierService.name);

  constructor(private configService: ConfigService) {
    const merchantId = this.configService.get<string>('KASHIER_MID');
    const apiKey = this.configService.get<string>('KASHIER_API_KEY');
    const modeStr = this.configService
      .get<string>('KASHIER_MODE', 'test')
      .toUpperCase();
    const mode =
      modeStr === 'LIVE' ? KashierPaymentMode.LIVE : KashierPaymentMode.TEST;

    // Fix for broken kashier-gateway package which expects a global KASHIER_CHECKOUT_URL
    (global as any).KASHIER_CHECKOUT_URL = this.configService.get<string>(
      'KASHIER_CHECKOUT_URL',
      'https://checkout.kashier.io',
    );

    if (!merchantId || !apiKey) {
      this.logger.warn('Kashier credentials missing in environment');
    } else {
      this.kashier = KashierNativeService.getInstance({
        merchantId: merchantId,
        apiKey: apiKey,
        mode: mode,
      });
    }
  }

  /**
   * بناء رابط الدفع (Hosted Payment Page)
   */
  generatePaymentUrl(orderData: {
    amount: number;
    currency?: string;
    orderId: string;
    merchantRedirectUrl: string;
    customer?: {
      reference: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    allowedMethods?: string[];
  }) {
    if (!this.kashier) {
      throw new Error('Kashier service not initialized correctly');
    }

    const orderDto: KashierOrderDto = {
      amount: orderData.amount,
      currency:
        (orderData.currency as KashierSupportedCurrency) ||
        KashierSupportedCurrency.EGP,
      orderId: orderData.orderId,
      merchantRedirectUrl: orderData.merchantRedirectUrl,
      customer: orderData.customer,
      allowedMethods: (orderData.allowedMethods as KashierPaymentMethod[]) || [
        KashierPaymentMethod.CARD,
        KashierPaymentMethod.WALLET,
      ],
    };

    // The package expects (orderDto, optionals)
    return this.kashier.generateOrderUrl(orderDto, {});
  }

  /**
   * التحقق من صحة الـ callback / webhook
   */
  verifyCallback(payload: any): boolean {
    if (!this.kashier) {
      throw new Error('Kashier service not initialized correctly');
    }

    const responseDto: KashierValidatableTransactionResponseDto = payload;
    return this.kashier.isSuccessfulPayment(responseDto);
  }
}
