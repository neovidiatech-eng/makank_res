import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateLogDTO } from './dto/create-log.dto';
import { GetLogsDTO } from './dto/get-logs.dto';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createLog(dto: CreateLogDTO): Promise<void> {
    try {
      await this.prisma.log.create({
        data: {
          userId: String(dto.userId),
          userName: dto.userName,
          userRole: dto.userRole,
          action: dto.action,
          details: dto.details,
          storeId: dto.storeId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write log entry', error);
    }
  }

  async getLogs(filters: GetLogsDTO) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.storeId !== undefined) {
      where.storeId = filters.storeId;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userName: true,
          userRole: true,
          action: true,
          details: true,
          createdAt: true,
        },
      }),
      this.prisma.log.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      personName: row.userName,
      role: row.userRole,
      action: row.action,
      details: row.details,
      createdAt: row.createdAt,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
