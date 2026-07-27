import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType, UserType } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateTransactionDTO,
  FilterTransactionDTO,
} from '../dto/transaction.dto';
import {
  getTransactionArgs,
  transactionSelectArgs,
} from '../prisma-args/transaction.prisma.args';

interface TransactionRule {
  debitMultiplier: number;
  creditMultiplier: number;
}

interface TransactionData {
  branchId?: number;
  customerId?: number;
  deliveryId?: number;
  userType: UserType;
  debit: number;
  credit: number;
  referenceId: number;
  type: TransactionType;
  balance: number;
}

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterTransactionDTO) {
    const args = getTransactionArgs(filters);
    const selectArgs = transactionSelectArgs();

    const transactions = await this.prisma.transaction.findMany({
      ...args,
      select: selectArgs,
    });
    const total = await this.prisma.transaction.count(args);
    return { transactions, total };
  }

  async findStatistic(filters: FilterTransactionDTO) {
    const args = getTransactionArgs(filters);
    const AllStatistic = await this.prisma.transaction.aggregate({
      _sum: {
        credit: true,
        debit: true,
      },
      where: args.where,
    });
    const statistics = await Promise.all(
      Object.values(TransactionType).map(async (type) => {
        const result = await this.prisma.transaction.aggregate({
          _sum: {
            credit: true,
          },
          where: {
            branchId: filters?.branchId,
            type,
          },
        });

        return {
          type,
          totalCredit: result._sum.credit || 0,
        };
      }),
    );
    return {
      FundStatistics: statistics,
      AllStatistic,
    };
  }

  // Transaction rules configuration - DRY approach
  private readonly TRANSACTION_RULES: Record<
    TransactionType,
    Partial<Record<UserType, TransactionRule>>
  > = {
    [TransactionType.ORDER_CREATED]: {
      [UserType.CUSTOMER]: { debitMultiplier: 0, creditMultiplier: 1 },
      [UserType.STORE]: { debitMultiplier: 1, creditMultiplier: 0 },
      [UserType.ADMIN]: { debitMultiplier: 1, creditMultiplier: 0 },
    },
    [TransactionType.ORDER_REFUND]: {
      [UserType.CUSTOMER]: { debitMultiplier: 1, creditMultiplier: 0 },
      [UserType.STORE]: { debitMultiplier: 0, creditMultiplier: 1 },
      [UserType.ADMIN]: { debitMultiplier: 0, creditMultiplier: 1 },
    },
    [TransactionType.FUND]: {
      [UserType.CUSTOMER]: { debitMultiplier: 1, creditMultiplier: 0 },
    },
    [TransactionType.ORDER_COMPLETED]: {
      [UserType.CUSTOMER]: { debitMultiplier: 0, creditMultiplier: 0 },
      [UserType.STORE]: { debitMultiplier: 1, creditMultiplier: 0 },
      [UserType.ADMIN]: { debitMultiplier: 1, creditMultiplier: 0 },
      [UserType.DELIVERY]: { debitMultiplier: 1, creditMultiplier: 0 },
    },
    [TransactionType.WITHDRAWAL]: {
      [UserType.STORE]: { debitMultiplier: 0, creditMultiplier: 1 },
      [UserType.DELIVERY]: { debitMultiplier: 0, creditMultiplier: 1 },
    },
  };

  /**
   * Creates transaction(s) based on the transaction type.
   * For ORDER_CREATED and ORDER_REFUND, creates multiple transactions (customer, store, admin).
   * For FUND and WITHDRAWAL, creates a single transaction.
   */
  async createTransaction(data: CreateTransactionDTO) {
    const { type } = data;

    // Multi-party transactions
    if (
      type === TransactionType.ORDER_CREATED ||
      type === TransactionType.ORDER_REFUND ||
      type === TransactionType.ORDER_COMPLETED
    ) {
      return this.createMultiPartyTransactions(data);
    }

    // Single-party transactions
    return this.createSingleTransaction(data);
  }

  /**
   * Creates transaction(s) within an existing Prisma transaction context.
   * Used when order creation and transaction logging must be atomic.
   */
  async createTransactionWithinTx(
    data: CreateTransactionDTO,
    tx: Prisma.TransactionClient,
  ) {
    const { type } = data;

    // Multi-party transactions
    if (
      type === TransactionType.ORDER_CREATED ||
      type === TransactionType.ORDER_REFUND ||
      type === TransactionType.ORDER_COMPLETED
    ) {
      return this.createMultiPartyTransactionsWithinTx(data, tx);
    }

    // Single-party transactions
    return this.createSingleTransactionWithinTx(data, tx);
  }

  /**
   * Creates multiple transactions for ORDER_CREATED and ORDER_REFUND
   * - Customer transaction
   * - Store transaction
   * - Admin transaction
   */
  private async createMultiPartyTransactions(data: CreateTransactionDTO) {
    const { userId, branchId, type, balance, referenceId, adminCommission } =
      data;

    const transactions: TransactionData[] = [];

    // Customer transaction
    if (userId) {
      const customerBalance = await this.getBalance(userId, undefined);
      const rules = this.getTransactionRules(type, UserType.CUSTOMER);
      const { debit, credit } = this.calculateDebitCredit(balance, rules);

      transactions.push({
        customerId: userId,
        userType: UserType.CUSTOMER,
        debit,
        credit,
        referenceId,
        type,
        balance: customerBalance + debit - credit,
      });
    }

    // Branch transaction
    if (branchId) {
      const branchBalance = await this.getBalance(undefined, branchId);
      const rules = this.getTransactionRules(type, UserType.STORE);
      const amount =
        type === TransactionType.ORDER_COMPLETED
          ? balance - (adminCommission || 0) - ((data as any).shipping || 0)
          : balance;
      const { debit, credit } = this.calculateDebitCredit(amount, rules);

      transactions.push({
        branchId,
        userType: UserType.STORE,
        debit,
        credit,
        referenceId,
        type,
        balance: branchBalance + debit - credit,
      });
    }

    // Admin transaction (commission)
    if (adminCommission && adminCommission > 0) {
      const adminBalance = await this.getAdminBalance();
      const rules = this.getTransactionRules(type, UserType.ADMIN);
      const { debit, credit } = this.calculateDebitCredit(
        adminCommission,
        rules,
      );

      transactions.push({
        userType: UserType.ADMIN,
        debit,
        credit,
        referenceId,
        type,
        balance: adminBalance + debit - credit,
      });
    }

    // Delivery transaction
    if (data.deliveryId) {
      const deliveryBalance = await this.getBalance(
        undefined,
        undefined,
        data.deliveryId,
      );
      const rules = this.getTransactionRules(type, UserType.DELIVERY);
      const amount =
        type === TransactionType.ORDER_COMPLETED
          ? (data as any).shipping || 0
          : balance;
      const { debit, credit } = this.calculateDebitCredit(amount, rules);

      transactions.push({
        deliveryId: data.deliveryId,
        userType: UserType.DELIVERY,
        debit,
        credit,
        referenceId,
        type,
        balance: deliveryBalance + debit - credit,
      });
    }

    // Create all transactions atomically
    return this.prisma.$transaction(
      transactions.map((txData) =>
        this.prisma.transaction.create({ data: txData }),
      ),
    );
  }

  /**
   * Creates a single transaction for FUND and WITHDRAWAL
   */
  private async createSingleTransaction(data: CreateTransactionDTO) {
    const { userId, branchId, deliveryId, type, balance, referenceId } = data;

    const userType = this.getUserType(userId, branchId, deliveryId);
    const rules = this.getTransactionRules(type, userType);
    const { debit, credit } = this.calculateDebitCredit(balance, rules);
    const currentBalance = await this.getBalance(userId, branchId, deliveryId);

    const transactionData: TransactionData = {
      branchId: userType === UserType.STORE ? branchId : undefined,
      customerId: userType === UserType.CUSTOMER ? userId : undefined,
      deliveryId: userType === UserType.DELIVERY ? deliveryId : undefined,
      userType,
      debit,
      credit,
      referenceId,
      type,
      balance: currentBalance + debit - credit,
    };

    return this.prisma.transaction.create({ data: transactionData });
  }

  /**
   * Creates multiple transactions within an existing transaction context
   */
  private async createMultiPartyTransactionsWithinTx(
    data: CreateTransactionDTO,
    tx: Prisma.TransactionClient,
  ) {
    const { userId, branchId, type, balance, referenceId, adminCommission } =
      data;

    const transactions: TransactionData[] = [];

    // Customer transaction
    if (userId) {
      const customerBalance = await this.getBalanceWithinTx(
        userId,
        undefined,
        undefined,
        tx,
      );
      const rules = this.getTransactionRules(type, UserType.CUSTOMER);
      const { debit, credit } = this.calculateDebitCredit(balance, rules);

      transactions.push({
        customerId: userId,
        userType: UserType.CUSTOMER,
        debit,
        credit,
        referenceId,
        type,
        balance: customerBalance + debit - credit,
      });
    }

    // Branch transaction
    if (branchId) {
      const branchBalance = await this.getBalanceWithinTx(
        undefined,
        branchId,
        undefined,
        tx,
      );
      const rules = this.getTransactionRules(type, UserType.STORE);
      const amount =
        type === TransactionType.ORDER_COMPLETED
          ? balance - (adminCommission || 0) - ((data as any).shipping || 0)
          : balance;
      const { debit, credit } = this.calculateDebitCredit(amount, rules);

      transactions.push({
        branchId,
        userType: UserType.STORE,
        debit,
        credit,
        referenceId,
        type,
        balance: branchBalance + debit - credit,
      });
    }

    // Admin transaction (commission)
    if (adminCommission && adminCommission > 0) {
      const adminBalance = await this.getAdminBalanceWithinTx(tx);
      const rules = this.getTransactionRules(type, UserType.ADMIN);
      const { debit, credit } = this.calculateDebitCredit(
        adminCommission,
        rules,
      );

      transactions.push({
        userType: UserType.ADMIN,
        debit,
        credit,
        referenceId,
        type,
        balance: adminBalance + debit - credit,
      });
    }

    // Delivery transaction
    if (data.deliveryId) {
      const deliveryBalance = await this.getBalanceWithinTx(
        undefined,
        undefined,
        data.deliveryId,
        tx,
      );
      const rules = this.getTransactionRules(type, UserType.DELIVERY);
      const amount =
        type === TransactionType.ORDER_COMPLETED
          ? (data as any).shipping || 0
          : balance;
      const { debit, credit } = this.calculateDebitCredit(amount, rules);

      transactions.push({
        deliveryId: data.deliveryId,
        userType: UserType.DELIVERY,
        debit,
        credit,
        referenceId,
        type,
        balance: deliveryBalance + debit - credit,
      });
    }

    // Create all transactions within the provided transaction context
    return Promise.all(
      transactions.map((txData) => tx.transaction.create({ data: txData })),
    );
  }

  /**
   * Creates a single transaction within an existing transaction context
   */
  private async createSingleTransactionWithinTx(
    data: CreateTransactionDTO,
    tx: Prisma.TransactionClient,
  ) {
    const { userId, branchId, deliveryId, type, balance, referenceId } = data;

    const userType = this.getUserType(userId, branchId, deliveryId);
    const rules = this.getTransactionRules(type, userType);
    const { debit, credit } = this.calculateDebitCredit(balance, rules);
    const currentBalance = await this.getBalanceWithinTx(
      userId,
      branchId,
      deliveryId,
      tx,
    );

    const transactionData: TransactionData = {
      branchId: userType === UserType.STORE ? branchId : undefined,
      customerId: userType === UserType.CUSTOMER ? userId : undefined,
      deliveryId: userType === UserType.DELIVERY ? deliveryId : undefined,
      userType,
      debit,
      credit,
      referenceId,
      type,
      balance: currentBalance + debit - credit,
    };

    return tx.transaction.create({ data: transactionData });
  }

  /**
   * Determines the user type based on userId, branchId, or deliveryId
   */
  private getUserType(
    userId?: number,
    branchId?: number,
    deliveryId?: number,
  ): UserType {
    if (userId) {
      return UserType.CUSTOMER;
    }
    if (branchId) {
      return UserType.STORE;
    }
    if (deliveryId) {
      return UserType.DELIVERY;
    }
    return UserType.ADMIN;
  }

  /**
   * Gets the current balance for a user or store
   */
  private async getBalance(
    userId?: number,
    branchId?: number,
    deliveryId?: number,
  ): Promise<number> {
    const lastTransaction = await this.prisma.transaction.findFirst({
      where: {
        OR: [
          userId ? { customerId: userId } : undefined,
          branchId ? { branchId: branchId } : undefined,
          deliveryId ? { deliveryId: deliveryId } : undefined,
        ].filter(Boolean),
      },
      select: { balance: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return lastTransaction?.balance || 0.0;
  }

  /**
   * Gets the current balance for admin
   */
  private async getAdminBalance(): Promise<number> {
    const lastTransaction = await this.prisma.transaction.findFirst({
      where: { userType: UserType.ADMIN },
      select: { balance: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return lastTransaction?.balance || 0.0;
  }

  /**
   * Gets transaction rules for a specific transaction type and user type
   */
  private getTransactionRules(
    type: TransactionType,
    userType: UserType,
  ): TransactionRule {
    const rules = this.TRANSACTION_RULES[type]?.[userType];
    if (!rules) {
      throw new Error(
        `No transaction rules defined for type: ${type}, userType: ${userType}`,
      );
    }
    return rules;
  }

  /**
   * Calculates debit and credit based on amount and rules
   */
  private calculateDebitCredit(
    amount: number,
    rules: TransactionRule,
  ): { debit: number; credit: number } {
    return {
      debit: amount * rules.debitMultiplier,
      credit: amount * rules.creditMultiplier,
    };
  }

  /**
   * Gets the current balance for a user or store within a transaction context
   */
  private async getBalanceWithinTx(
    userId?: number,
    branchId?: number,
    deliveryId?: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const lastTransaction = await tx.transaction.findFirst({
      where: {
        OR: [
          userId ? { customerId: userId } : undefined,
          branchId ? { branchId: branchId } : undefined,
          deliveryId ? { deliveryId: deliveryId } : undefined,
        ].filter(Boolean),
      },
      select: { balance: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return lastTransaction?.balance || 0.0;
  }

  /**
   * Gets the current balance for admin within a transaction context
   */
  private async getAdminBalanceWithinTx(
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const lastTransaction = await tx.transaction.findFirst({
      where: { userType: UserType.ADMIN },
      select: { balance: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return lastTransaction?.balance || 0.0;
  }
}
