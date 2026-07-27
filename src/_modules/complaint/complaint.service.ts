import { Injectable, NotFoundException } from '@nestjs/common';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateComplaintDTO,
  CreateComplaintReplyDTO,
  FilterComplaintDTO,
  UpdateComplaintStatusDTO,
} from './dto/complaint.dto';
import {
  getComplaintArgs,
  selectComplaintOBJ,
} from './prisma-args/complaint.prisma.args';

@Injectable()
export class ComplaintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(body: CreateComplaintDTO) {
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return await this.prisma.complaint.create({
      data: {
        orderId: body.orderId,
        userId: body.userId,
        reason: body.reason,
      },
    });
  }

  async findAll(filters: FilterComplaintDTO) {
    const args = getComplaintArgs(filters);
    const select = selectComplaintOBJ();

    return await this.prisma.complaint[firstOrMany(filters.id)]({
      where: args.where,
      select,
      take: args.take,
      skip: args.skip,
      orderBy: args.orderBy,
    });
  }

  async count(filters: FilterComplaintDTO) {
    const args = getComplaintArgs(filters);
    return await this.prisma.complaint.count({ where: args.where });
  }

  async updateStatus(id: Id, body: UpdateComplaintStatusDTO) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id, deletedAt: null },
    });

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    return await this.prisma.complaint.update({
      where: { id },
      data: { status: body.status },
    });
  }

  async delete(id: Id) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id, deletedAt: null },
    });

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    return await this.prisma.complaint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async reply(complaintId: Id, body: CreateComplaintReplyDTO) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId, deletedAt: null },
    });

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    await this.prisma.complaintReply.create({
      data: {
        complaintId,
        userId: body.userId,
        message: body.message,
      },
    });

    await this.notificationService.sendLocalizedNotification(
      complaint.userId,
      {
        ar: 'تم الرد على شكواك',
        en: 'Your complaint has been answered',
      },
      {
        ar: body.message,
        en: body.message,
      },
    );
  }
}
