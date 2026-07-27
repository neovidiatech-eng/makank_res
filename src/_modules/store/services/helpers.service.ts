import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateStoreUserDTO } from '../dto/store.dto';

@Injectable()
export class HelpersService {
  constructor(private readonly prisma: PrismaService) {}
  async isUserExist(data: CreateStoreUserDTO) {
    const user = await this.prisma.user.findUnique({
      where: {
        email_roleKey: {
          email: data.email,
          roleKey: RolesKeys.STORE,
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

    const user2 = data.phone
      ? await this.prisma.user.findUnique({
          where: {
            phone_roleKey: {
              phone: data.phone,
              roleKey: RolesKeys.STORE,
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

    if (user || user2) throw new ConflictException('user already exists');
    return user;
  }
  async createUser(
    data: CreateStoreUserDTO,
    existingUser: Prisma.UserGetPayload<{
      select: {
        email: true;
        phone: true;
        id: true;
        name: true;
        verified: true;
      };
    }>,
    tx: Prisma.TransactionClient,
    storeId: Id,
  ) {
    const hashedPassword = hashPassword(data.password);
    data.password = hashedPassword;
    const branches = await tx.branch.findMany({
      where: {
        storeId,
      },
    });
    if (existingUser && existingUser.email !== data.email) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          email: data.email,
          name: data.name,
          branchId: branches[0].id,
          storeId: storeId,
        },
      });
      return existingUser;
    }
    const role = await tx.role.findFirst({
      where: { roleKey: RolesKeys.STORE },
    });
    const response =
      existingUser && !existingUser.verified
        ? existingUser
        : await tx.user.create({
            data: {
              ...data,
              roleId: role.id,
              roleKey: RolesKeys.STORE,
              branchId: branches[0].id,
              storeId: storeId,
            },
            select: { email: true, phone: true, id: true, name: true },
          });

    if (existingUser?.verified) delete existingUser.verified;
    return response;
  }
}
