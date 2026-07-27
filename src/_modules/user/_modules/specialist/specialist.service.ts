import { Injectable } from '@nestjs/common';
import { isArray } from 'class-validator';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateSpecialistDTO,
  FilterSpecialistDTO,
  UpdateSpecialistDTO,
} from './dto/specialist.dto';
import { getArgs } from './prisma-args/specialist.prisma.args';

@Injectable()
export class SpecialistService {
  constructor(private prisma: PrismaService) {}

  async createSpecialist(data: CreateSpecialistDTO) {
    await this.prisma.specialist.create({ data });
  }

  async updateSpecialist(data: WithId<UpdateSpecialistDTO>) {
    const { id, ...rest } = data;
    await this.prisma.specialist.update({
      where: { id },
      data: {
        ...rest,
      },
    });
  }

  async getAll(filters: FilterSpecialistDTO) {
    const whereArgs = getArgs(filters);
    let data = await this.prisma.specialist[firstOrMany(filters.id)]({
      ...whereArgs,
    });

    if (!isArray(data)) data = data[0];

    const total = await this.prisma.specialist.count({
      where: whereArgs.where,
    });
    return { data, total };
  }

  async delete(id: Id) {
    await this.prisma.specialist.delete({
      where: { id },
    });
  }
}
