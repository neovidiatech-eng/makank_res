import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { LanguagesService } from '../languages/languages.service';
import {
  CreateEmployeeDTO,
  FilterEmployeeDTO,
  UpdateEmployeeDTO,
} from './dto/employee.dto';
import { HelpersService } from './helpers/employee.helper.service';
import { getEmployeeArgs } from './prisma-args/employee.prisma.args';
@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Language: LanguagesService,
    private readonly helpers: HelpersService,
  ) {}
  async getAll(filters: FilterEmployeeDTO) {
    const args = getEmployeeArgs(filters);
    const employee = await this.prisma.user[firstOrMany(filters.id)](args);
    return employee;
  }
  async count(filters: FilterEmployeeDTO) {
    const args = getEmployeeArgs(filters);
    return this.prisma.user.count({ where: args.where });
  }
  async create(dto: CreateEmployeeDTO) {
    const role = await this.helpers.isRoleValid(dto.roleId, dto.storeId);
    const { roleId, branchId, ...data } = dto;

    const resolvedBranchId = await this.helpers.resolveEmployeeBranchId(
      dto.storeId,
      branchId,
    );

    // Without this, a duplicate email/phone for this role hits the DB's
    // unique constraint directly on the insert below instead of a clean,
    // predictable error — same check UserService.create() already does.
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { phone: data.phone }],
        roleKey: role.roleKey,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('user_already_exist');
    }

    await this.prisma.user.create({
      data: {
        ...data,
        branchId: resolvedBranchId,
        password: hashPassword(dto.password),
        roleId: role.id,
        roleKey: role.roleKey,
        // Dashboard-created employees skip the OTP step, same as UserService.create.
        verified: true,
      },
    });
  }
  async update(id: number, dto: UpdateEmployeeDTO, user: CurrentUser) {
    const employee = await this.helpers.canUserAccessEmployee(user, id);
    if (dto.roleId) {
      await this.helpers.isRoleValid(dto.roleId, employee.storeId);
    }
    if (dto.branchId) {
      await this.helpers.resolveEmployeeBranchId(
        employee.storeId,
        dto.branchId,
      );
    }
    await this.prisma.user.update({ where: { id }, data: { ...dto } });
  }
  async delete(id: number, user: CurrentUser) {
    await this.helpers.canUserAccessEmployee(user, id);
    await this.prisma.user.delete({
      where: { id },
    });
  }
}
