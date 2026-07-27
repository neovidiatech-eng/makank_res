import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import {
  CreateAddressDTO,
  FilterAddressDTO,
  UpdateAddressDTO,
} from './dto/address.dto';

import {
  getAddressArgs,
  getAddressArgsWithSelect,
} from './prisma-args/address.prisma.args';
@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAddressDTO) {
    const { address, ...rest } = data;
    const count = await this.prisma.address.count({
      where: {
        userId: data.userId,
      },
    });
    await this.prisma.address.create({
      data: {
        adress: address,
        ...rest,
        default: count === 0 ? true : false,
      },
    });
  }

  async update(id: Id, body: UpdateAddressDTO) {
    const { address, ...rest } = body;
    await this.prisma.address.update({
      where: { id },
      data: { adress: address, ...rest },
    });

    if (body.default) {
      await this.prisma.address.updateMany({
        data: {
          default: false,
        },
        where: {
          id: {
            not: id,
          },
          default: true,
          userId: body.userId,
        },
      });
    }
  }

  async findAll(filters: FilterAddressDTO) {
    const args = getAddressArgs(filters);
    const argsWithSelect = getAddressArgsWithSelect();

    const data = await this.prisma.address[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterAddressDTO) {
    const args = getAddressArgs(filters);
    const total = await this.prisma.address.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    const address = await this.prisma.address.findUnique({
      where: {
        id,
      },
    });
    if (address.default) {
      throw new ConflictException('default_address_cannot_be_deleted');
    }
    await this.prisma.address.delete({
      where: {
        id,
      },
    });
  }
}
