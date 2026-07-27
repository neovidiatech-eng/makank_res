import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PaymentService {
  private readonly moyasarApiUrl = 'https://api.moyasar.com/v1';
  private readonly secretKey: string;

  constructor() {
    this.secretKey = process.env.MOYASAR_SECRET_KEY;
  }

  async getPaymentDetails(
    paymentId: string,
    checkAmount: number,
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${this.moyasarApiUrl}/payments/${paymentId}`,
        {
          auth: { username: this.secretKey, password: '' },
        },
      );
      const responseData = {
        status: true,
        message: 'Payment retrieved successfully',
        data: response.data,
      };
      const payment = response.data;
      const paymentAmount = payment.amount / 100;
      if (!payment) {
        responseData.status = false;
        responseData.message = 'Payment not found';
      }
      if (payment.status !== 'paid') {
        responseData.status = false;
        responseData.message = 'Payment is not paid';
      }
      if (checkAmount !== paymentAmount) {
        responseData.status = false;
        responseData.message = 'Payment amount is not correct';
      }

      return responseData;
    } catch (error) {
      throw new Error(
        error.response?.data?.message || 'Failed to retrieve payment details',
      );
    }
  }
}
