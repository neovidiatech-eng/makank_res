import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateCashSettlementDTO,
  FilterCashSettlementDTO,
} from '../dto/driver-cash-settlement.dto';
import {
  getCashSettlementArgs,
  getCashSettlementArgsWithSelect,
} from '../prisma-args/driver-cash-settlement.prisma.args';

@Injectable()
export class DriverCashSettlementService {
  constructor(private readonly prisma: PrismaService) {}

  // Admin recording a physical cash handover already received from the driver — this
  // creation IS the confirmation (no pending/approve step), so it decrements
  // Details.collectedCash immediately.
  async create(dto: CreateCashSettlementDTO) {
    const details = await this.prisma.details.findUnique({
      where: { userId: dto.deliveryId },
    });
    if (!details) throw new NotFoundException('Driver wallet not found');
    if (details.collectedCash < dto.amount) {
      throw new BadRequestException(
        'Amount exceeds cash currently held by this driver',
      );
    }

    const settlement = await this.prisma.driverCashSettlement.create({
      data: { deliveryId: dto.deliveryId, amount: dto.amount, note: dto.note },
    });

    // A partial settlement reduces unsettledCommission by the same proportion of
    // collectedCash being settled, so it stays consistent with what's still held
    // (e.g. settling half the cash releases half the commission owed on it).
    const ratio =
      details.collectedCash > 0 ? dto.amount / details.collectedCash : 0;
    await this.prisma.details.update({
      where: { userId: dto.deliveryId },
      data: {
        collectedCash: { decrement: dto.amount },
        unsettledCommission: { decrement: details.unsettledCommission * ratio },
      },
    });

    return settlement;
  }

  async findAll(filters: FilterCashSettlementDTO) {
    const args = getCashSettlementArgs(filters);
    const argsWithSelect = getCashSettlementArgsWithSelect();
    return this.prisma.driverCashSettlement[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
  }

  async count(filters: FilterCashSettlementDTO) {
    const args = getCashSettlementArgs(filters);
    return this.prisma.driverCashSettlement.count({ where: args.where });
  }
}
