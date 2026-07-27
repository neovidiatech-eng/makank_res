import { ConflictException, Injectable } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateCustomerDTO } from '../dto/create.customer.dto';

@Injectable()
export class CustomerCreateService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateCustomerDTO) {
    const { ...rest } = data;

    let existingCustomer = rest.phone
      ? await this.prisma.user.findUnique({
          where: {
            phone_roleKey: {
              phone: rest.phone,
              roleKey: RolesKeys.CUSTOMER,
            },
          },
          select: {
            email: true,
            phone: true,
            id: true,
            name: true,
            verified: true,
          },

          __includeDeleted: true as never,
        })
      : null;
    if (!existingCustomer)
      existingCustomer = await this.prisma.user.findUnique({
        where: {
          email_roleKey: {
            email: rest.email,
            roleKey: RolesKeys.CUSTOMER,
          },
        },
        select: {
          email: true,
          phone: true,
          id: true,
          name: true,
          verified: true,
        },

        __includeDeleted: true as never,
      });

    if (existingCustomer && existingCustomer.verified)
      throw new ConflictException('customer already exists');

    const hashedPassword = hashPassword(rest.password);
    rest.password = hashedPassword;
    if (existingCustomer && existingCustomer.email !== rest.email) {
      await this.prisma.user.update({
        where: { id: existingCustomer.id },
        data: { email: rest.email },
      });
      return existingCustomer;
    }
    if (
      existingCustomer &&
      rest.phone &&
      existingCustomer.phone !== rest.phone
    ) {
      await this.prisma.user.update({
        where: { id: existingCustomer.id },
        data: { phone: rest.phone },
      });
      return existingCustomer;
    }
    if (existingCustomer) {
      await this.prisma.user.update({
        where: { id: existingCustomer.id },
        data: { password: rest.password, name: rest.name },
      });
      return existingCustomer;
    }
    const role = await this.prisma.role.findFirst({
      where: { roleKey: RolesKeys.CUSTOMER },
    });
    const response =
      existingCustomer && !existingCustomer.verified
        ? existingCustomer
        : await this.prisma.user.create({
            data: {
              ...rest,
              roleId: role.id,
              roleKey: RolesKeys.CUSTOMER,
              Details: {
                create: {
                  points: 0,
                  wallet: 0.0,
                },
              },
            },
            select: { email: true, phone: true, id: true, name: true },
          });

    if (existingCustomer?.verified) delete existingCustomer.verified;
    return response;
  }
}
