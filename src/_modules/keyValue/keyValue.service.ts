import { Injectable } from '@nestjs/common';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { localizedObject } from 'src/globals/helpers/localized.return';
import { PrismaService } from 'src/globals/services/prisma.service';

import { CreateKeyValueDTO, UpdateKeyValueDTO } from './dto/create.dto';
import { FilterKeyValueDTO } from './dto/filter.dto';
import {
  getKeyValueArgs,
  getKeyValueArgsWithSelect,
} from './prisma-args/keyValue.prisma.args';

@Injectable()
export class KeyValueService {
  constructor(private prisma: PrismaService) {}
  async create(data: CreateKeyValueDTO) {
    await this.prisma.keyValue.create({
      data,
    });
  }
  async update(id: Id, data: UpdateKeyValueDTO) {
    await this.prisma.keyValue.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: Id) {
    await this.prisma.keyValue.delete({
      where: { id },
    });
  }

  async getAll(locale: Locale, filters: FilterKeyValueDTO) {
    const args = getKeyValueArgs(filters);
    const argsWithSelect = getKeyValueArgsWithSelect();

    const data = await this.prisma.keyValue[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    const total = await this.prisma.keyValue.count({ where: args.where });
    return { data: localizedObject(data, locale), total };
  }
}
