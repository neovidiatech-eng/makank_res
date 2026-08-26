import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../../../globals/services/prisma.service';

import { OrderStatus, OTPType, SessionType } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { resolveDateRangeFilter } from 'src/_modules/user/_modules/customer/prisma-args/customer.prisma-args';
import { firstOrMany, isOne } from 'src/globals/helpers/first-or-many';
import {
  hashPassword,
  validateUserPassword,
} from 'src/globals/helpers/password.helpers';
import { VerifyResetOtpDTO } from '../../authentication/dto/reset-password.dto';
import { TokenService } from '../../authentication/services/jwt.service';
import { OTPService } from '../../authentication/services/otp.service';
import {
  CreateUserDTO,
  EnableBioDTO,
  UpdateNotificationSettingDTO,
  UpdateUserDTO,
  UpdateUserPasswordDTO,
} from '../dto/create.user.dto';
import { FilterUserCouponDTO } from '../dto/filter.user.coupon.dto';
import { FilterUserDTO, UserOrderFilterEnum } from '../dto/filter.user.dto';
import { getUserArgs } from '../prisma-args/user.prisma-ags';
import {
  FlattenedUser,
  getUserCouponArgs,
  selectUserWithRoleAndPermissionsOBJ,
  transformFlattenUser,
} from '../prisma-args/user.prisma-select';
import { HelperService } from './helper.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private Token: TokenService,
    private OTP: OTPService,
    private helper: HelperService,
  ) {}

  async getUser(userId: Id) {
    const selectObj = selectUserWithRoleAndPermissionsOBJ();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: selectObj,
    });
    const flattenUser = transformFlattenUser(user);
    return flattenUser;
  }

  async attachOrderStatsToUsers(users: any[], filters?: FilterUserDTO) {
    if (!users || users.length === 0) return users;
    const userIds = users.map((u) => u?.id).filter(Boolean);
    if (userIds.length === 0) return users;

    const dateRange = filters ? resolveDateRangeFilter(filters as any) : null;
    const isDriverQuery =
      filters?.roleKey === RolesKeys.DELIVERY ||
      users.some((u) => u?.roleKey === RolesKeys.DELIVERY);

    const targetField = isDriverQuery ? 'deliveryId' : 'userId';

    const statsGrouped = await this.prisma.order.groupBy({
      by: [targetField as any, 'status'],
      where: {
        [targetField]: { in: userIds },
        ...(dateRange
          ? {
              OR: [{ date: dateRange }, { createdAt: dateRange }],
            }
          : {}),
      },
      _count: { id: true },
      _sum: { totalPriceAfterDiscount: true },
    });

    const userStatsMap = new Map<
      number,
      {
        totalOrders: number;
        completedOrders: number;
        cancelledOrders: number;
        totalSpent: number;
      }
    >();

    for (const item of statsGrouped) {
      const id = (item as any)[targetField];
      if (!id) continue;
      let stats = userStatsMap.get(id);
      if (!stats) {
        stats = {
          totalOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          totalSpent: 0,
        };
        userStatsMap.set(id, stats);
      }
      const count = item._count.id;
      stats.totalOrders += count;
      if (item.status === OrderStatus.DELIVERED) {
        stats.completedOrders += count;
        stats.totalSpent += item._sum.totalPriceAfterDiscount ?? 0;
      } else if (
        item.status === OrderStatus.CANCELLED ||
        item.status === OrderStatus.REJECTED
      ) {
        stats.cancelledOrders += count;
      }
    }

    return users.map((user) => {
      if (!user) return user;
      const stats = userStatsMap.get(user.id) || {
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        totalSpent: 0,
      };
      return {
        ...user,
        orderStats: stats,
      };
    });
  }

  async getAll(filters: FilterUserDTO) {
    if (filters?.orderFilter === UserOrderFilterEnum.MOST_CANCELLED) {
      const args = getUserArgs(filters);
      delete args.take;
      delete args.skip;

      const users = (await this.prisma.user.findMany(args)) as any[];
      const enrichedUsers = await this.attachOrderStatsToUsers(users, filters);

      enrichedUsers.sort(
        (a, b) =>
          (b.orderStats?.cancelledOrders ?? 0) -
          (a.orderStats?.cancelledOrders ?? 0),
      );

      const page = filters.page ? +filters.page : 1;
      const limit = filters.limit ? +filters.limit : 10;
      const paginated = enrichedUsers.slice((page - 1) * limit, page * limit);
      return isOne(filters?.id) ? paginated[0] || null : paginated;
    }

    const args = getUserArgs(filters);
    const users = await this.prisma.user[firstOrMany(filters?.id)](args);
    if (!users) return isOne(filters?.id) ? null : [];
    const usersArray = Array.isArray(users) ? users : [users];
    const enriched = await this.attachOrderStatsToUsers(usersArray, filters);
    return isOne(filters?.id) ? enriched[0] || null : enriched;
  }

  async getFcmToken(jti: string) {
    const session = await this.prisma.session.findUnique({
      where: { jti },
      select: { fcmToken: true },
    });

    return session?.fcmToken;
  }

  async count(filters: FilterUserDTO) {
    const args = getUserArgs(filters);
    return this.prisma.user.count({ where: args.where });
  }


  async delete(id: Id) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        phone: user.phone ? `deleted_${user.phone}_${user.id}` : null,
        email: `deleted_${user.email}_${user.id}`,
      },
    });
    await this.prisma.user.delete({ where: { id } });
  }

  async verify(userId: Id, data: VerifyResetOtpDTO) {
    await this.OTP.verifyOTP(userId, data.otp, OTPType.EMAIL_VERIFICATION);
    await this.prisma.user.update({
      where: { id: userId },
      data: { verified: true },
    });
    const user = await this.getProfile(userId);
    const token = await this.Token.generateToken(
      user?.user?.id,
      undefined,
      SessionType.ACCESS,
    );
    return { user, token };
  }

  async create(data: CreateUserDTO, user: CurrentUser) {
    const creatorIsAdmin = user.Role.roleKey === RolesKeys.ADMIN;
    const roleIdNum = Number(data.roleId);

    // Resolve the role we actually assign.
    // - Admin: honor the explicitly chosen data.roleId (validated to exist by the
    //   DTO) so a user created against a custom dashboard role inherits ONLY that
    //   role's permissions — never the seeded super-admin role. We still require
    //   it to be an admin-surface role (roleKey === ADMIN) so this endpoint can't
    //   be used to mint Store/Customer/Delivery accounts.
    // - Store owner: ignore the client roleId and force the seeded Store role;
    //   store owners must only ever create Store-scoped users.
    const role = creatorIsAdmin
      ? await this.prisma.role.findUnique({ where: { id: roleIdNum } })
      : await this.prisma.role.findFirst({
          where: { roleKey: RolesKeys.STORE },
        });

    if (!role || (creatorIsAdmin && role.roleKey !== RolesKeys.ADMIN)) {
      throw new BadRequestException('invalid_role');
    }

    await this.helper.userExistOrThrow({
      email: data.email,
      phone: data.phone,
      roleKey: role.roleKey,
    });

    const hashedPassword = hashPassword(data.password);
    const { roleId: _ignored, ...rest } = data;
    await this.prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        roleId: Number(role.id),
        roleKey: role.roleKey,
        // Dashboard-created users (by admin or store owner) skip the OTP step
        // and are verified immediately so they can log in instantly.
        verified: true,
        storeId: creatorIsAdmin ? undefined : user.storeId,
      },
      select: { email: true, phone: true, id: true, name: true },
    });
  }

  async updateCurrentUser(dto: UpdateUserDTO, userId: Id, jti: string) {
    const { fcm, male, ...data } = dto;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (data?.phone) {
      const isFound = await this.prisma.user.findFirst({
        where: { phone: data.phone, roleKey: user.roleKey, deletedAt: null },
      });
      if (isFound && isFound.id !== userId) {
        if (!isFound.verified) {
          await this.prisma.user.update({
            where: { id: isFound.id },
            data: { phone: null },
          });
        } else {
          throw new BadRequestException('phone_already_exists');
        }
      }
    }
    if (data?.email) {
      const isFound = await this.prisma.user.findFirst({
        where: { email: data.email, roleKey: user.roleKey, deletedAt: null },
      });
      if (isFound && isFound.id !== userId) {
        if (!isFound.verified) {
          await this.prisma.user.update({
            where: { id: isFound.id },
            data: { email: null },
          });
        } else {
          throw new BadRequestException('email_already_exists');
        }
      }
    }
    if (fcm) {
      // Detach this FCM token from any OTHER user's sessions before binding it to
      // the current session. A shared/reused device must never leave its token
      // registered under a previous account — otherwise that account's pushes would
      // also reach this device. Mirrors TokenService.generateToken hygiene.
      await this.prisma.session.updateMany({
        where: { fcmToken: fcm, userId: { not: userId } },
        data: { fcmToken: null },
      });
      await this.prisma.session.update({
        where: {
          jti,
        },
        data: {
          fcmToken: fcm,
        },
      });
    }
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    if (
      data.image &&
      user.image &&
      user.image !== data.image &&
      !user.image.includes('default')
    ) {
      const uploadsRoot = env('UPLOADS_PATH') || 'uploads';
      const relPath = user.image.replace(/^(\/?uploads\/|\/?uploads)/, '');
      const possiblePaths = [
        path.join(uploadsRoot, relPath),
        path.join(process.cwd(), user.image),
      ];
      for (const oldFilePath of possiblePaths) {
        try {
          if (fs.existsSync(oldFilePath) && fs.statSync(oldFilePath).isFile()) {
            fs.unlinkSync(oldFilePath);
            break;
          }
        } catch {
          // best effort cleanup
        }
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
      },
    });
  }

  async enableBio(userId: Id, dto: EnableBioDTO) {
    const user = await this.prisma.user.findFirst({
      where: { deviceId: dto.deviceId, roleKey: dto.roleKey },
    });
    if (user) {
      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          deviceId: null,
        },
      });
    }
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        deviceId: dto.deviceId,
      },
    });
  }
  async updatePassword(id: Id, data: UpdateUserPasswordDTO) {
    const { password, newPassword } = data;
    const user = await this.prisma.user.findUnique({ where: { id } });
    validateUserPassword(password, user.password, 'invalid old password');
    const hashedPassword = hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
    });
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });
  }

  async getProfile(id) {
    const user = await this.getUser(id);
    const unReadNotifications = await this.prisma.notification.count({
      where: {
        userId: id,
        read: false,
      },
    });

    return { user, unReadNotifications };
  }

  async getPermissions(id: Id) {
    const user: FlattenedUser = await this.getUser(id);
    return user.Permissions;
  }

  async update(id: Id, data: UpdateUserDTO) {
    const { roleId, ...rest } = data;
    await this.prisma.user.update({
      where: { id: Number(id) },
      data: {
        ...rest,
        ...(roleId ? { roleId: Number(roleId) } : {}),
      },
    });
  }

  async updateLocale(jti: string, locale: string) {
    await this.prisma.session.update({
      where: { jti },
      data: { languageId: locale },
    });
  }

  async updateNotificationSetting(
    userId: Id,
    jti: string,
    dto: UpdateNotificationSettingDTO,
  ) {
    const { allow, fcm } = dto;
    const fcmToken = allow ? fcm : null;

    // Detach this FCM token from any OTHER user's sessions before (re)binding it
    // here, so a shared/reused device never keeps delivering a previous account's
    // push notifications. Only needed when actually setting a token (allow=true).
    if (fcmToken) {
      await this.prisma.session.updateMany({
        where: { fcmToken, userId: { not: userId } },
        data: { fcmToken: null },
      });
    }

    // Update all sessions for this user with the new FCM token
    await this.prisma.session.updateMany({
      where: { userId },
      data: { fcmToken },
    });

    // Update the user's allowNotification preference
    await this.prisma.user.update({
      where: { id: userId },
      data: { allowNotification: allow },
    });
  }

  async getCoupons(userId: Id, filters?: FilterUserCouponDTO) {
    const args = getUserCouponArgs(filters, userId);
    const data = await this.prisma.coupon.findMany({
      ...args,
    });
    const total = await this.prisma.coupon.count({
      where: args.where,
    });

    return { data, total };
  }
}
