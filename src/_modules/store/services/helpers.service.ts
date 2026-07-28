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
    // Soft-deleted rows are excluded automatically (no __includeDeleted) —
    // a previously deleted store's owner email/phone must be reusable for a
    // new store, otherwise store creation is permanently blocked for that
    // email once a test/old store using it is ever removed.
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
        })
      : null;

    // A verified, active account is a real conflict — can't silently take it
    // over. An unverified one (registration never completed) is returned so
    // createUser() can reuse/refresh it instead of creating a duplicate.
    if ((user && user.verified) || (user2 && user2.verified)) {
      throw new ConflictException('user already exists');
    }
    if (user2 && user && user2.id !== user.id) {
      throw new ConflictException('user already exists');
    }

    return user || user2 || null;
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
    // default: true is required here — every store's custom employee roles
    // (created via POST /roles) also carry roleKey: 'Store', just scoped to
    // that store and default: false. Without this filter, findFirst() could
    // return an arbitrary employee role instead of the one true full-access
    // owner role, silently handing the new store owner the wrong permission
    // set (login succeeds, every permission-gated store endpoint then 401s).
    const role = await tx.role.findFirst({
      where: { roleKey: RolesKeys.STORE, default: true },
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
