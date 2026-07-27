import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BundleFreeValueRule,
  BundlePricingMode,
  BundleScopeRole,
  BundleSizeRule,
  Prisma,
} from '@prisma/client';
import { assertStoreAccepted } from 'src/globals/helpers/assert-store-accepted.helper';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateBundleDTO,
  FilterBundleDTO,
  UpdateBundleDTO,
} from './dto/bundle.dto';
import { getBundleArgs } from './prisma-args/bundle.prisma.args';

@Injectable()
export class BundleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(bundleInput: CreateBundleDTO) {
    await assertStoreAccepted(this.prisma, bundleInput.storeId);
    this.validateRules(bundleInput);
    await this.validateScopeOwnership(bundleInput.storeId, bundleInput);
    await this.prisma.bundle.create({ data: this.createData(bundleInput) });
  }

  async update(id: Id, bundleInput: UpdateBundleDTO) {
    const existingBundle = await this.prisma.bundle.findUnique({
      where: { id },
    });
    if (!existingBundle) throw new BadRequestException('Bundle not found');
    // Validate the effective merged state, not the partial DTO alone — otherwise
    // updating a single rule field (e.g. paidSizeRule -> NAME) would be rejected for
    // a dependent field (paidRequiredSizeName) that already exists on the stored bundle.
    this.validateRules({
      ...existingBundle,
      ...bundleInput,
    } as Partial<CreateBundleDTO>);
    const scopeUpdateRequested = this.hasScopeUpdate(bundleInput);
    if (scopeUpdateRequested) {
      this.assertCompleteScopeUpdate(bundleInput);
      await this.validateScopeOwnership(existingBundle.storeId, bundleInput);
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.bundle.update({
        where: { id },
        data: this.updateData(bundleInput, scopeUpdateRequested),
      });
    });
  }

  async findAll(filters: FilterBundleDTO, includeInactive = false) {
    return this.prisma.bundle[firstOrMany(filters.id)](
      getBundleArgs(filters, includeInactive),
    );
  }

  async count(filters: FilterBundleDTO, includeInactive = false) {
    const args = getBundleArgs(filters, includeInactive);
    return this.prisma.bundle.count({ where: args.where });
  }

  async delete(id: Id) {
    await this.prisma.bundle.delete({ where: { id } });
  }

  private validateRules(bundleInput: Partial<CreateBundleDTO>) {
    if (
      bundleInput.requiredPaidQuantity !== undefined &&
      bundleInput.requiredPaidQuantity < 1
    )
      throw new BadRequestException('requiredPaidQuantity must be at least 1');
    if (bundleInput.freeQuantity !== undefined && bundleInput.freeQuantity < 1)
      throw new BadRequestException('freeQuantity must be at least 1');
    if (
      bundleInput.paidSizeRule === BundleSizeRule.NAME &&
      !bundleInput.paidRequiredSizeName
    )
      throw new BadRequestException(
        'paidRequiredSizeName is required when paidSizeRule is NAME',
      );
    if (
      bundleInput.freeSizeRule === BundleSizeRule.NAME &&
      !bundleInput.freeRequiredSizeName
    )
      throw new BadRequestException(
        'freeRequiredSizeName is required when freeSizeRule is NAME',
      );
    if (
      bundleInput.freeValueRule === BundleFreeValueRule.MAX_FREE_VALUE &&
      bundleInput.maxFreeItemValue == null
    )
      throw new BadRequestException(
        'maxFreeItemValue is required when freeValueRule is MAX_FREE_VALUE',
      );
    if (
      bundleInput.pricingMode === BundlePricingMode.FIXED &&
      (bundleInput.priceAfterDiscount == null ||
        bundleInput.priceAfterDiscount < 0)
    )
      throw new BadRequestException(
        'priceAfterDiscount is required and must be non-negative when pricingMode is FIXED',
      );
    if (
      bundleInput.priceBeforeDiscount != null &&
      bundleInput.priceAfterDiscount != null &&
      bundleInput.priceAfterDiscount >= bundleInput.priceBeforeDiscount
    )
      throw new BadRequestException(
        'priceAfterDiscount must be strictly less than priceBeforeDiscount',
      );
  }

  private hasScopeUpdate(bundleInput: UpdateBundleDTO) {
    return [
      'paidServiceIds',
      'paidCategoryIds',
      'freeServiceIds',
      'freeCategoryIds',
    ].some((scopeKey) => bundleInput[scopeKey] !== undefined);
  }

  private assertCompleteScopeUpdate(bundleInput: UpdateBundleDTO) {
    const scopeKeys = [
      'paidServiceIds',
      'paidCategoryIds',
      'freeServiceIds',
      'freeCategoryIds',
    ];
    if (scopeKeys.some((scopeKey) => bundleInput[scopeKey] === undefined))
      throw new BadRequestException(
        'Scope updates must include every paid and free scope array',
      );
  }

  private async validateScopeOwnership(
    storeId: Id,
    bundleInput: Partial<CreateBundleDTO>,
  ) {
    const paidServiceIds = bundleInput.paidServiceIds ?? [];
    const paidCategoryIds = bundleInput.paidCategoryIds ?? [];
    const freeServiceIds = bundleInput.freeServiceIds ?? [];
    const freeCategoryIds = bundleInput.freeCategoryIds ?? [];
    if (!paidServiceIds.length && !paidCategoryIds.length)
      throw new BadRequestException('At least one paid scope is required');
    if (!freeServiceIds.length && !freeCategoryIds.length)
      throw new BadRequestException('At least one free scope is required');
    await this.assertServicesBelongToStore(storeId, [
      ...paidServiceIds,
      ...freeServiceIds,
    ]);
    await this.assertCategoriesBelongToStore(storeId, [
      ...paidCategoryIds,
      ...freeCategoryIds,
    ]);
  }

  private async assertServicesBelongToStore(storeId: Id, serviceIds: Id[]) {
    if (!serviceIds.length) return;
    const ownedCount = await this.prisma.service.count({
      where: { id: { in: serviceIds }, storeId, deletedAt: null },
    });
    if (ownedCount !== new Set(serviceIds).size)
      throw new BadRequestException(
        'Every scoped service must belong to the bundle store',
      );
  }

  private async assertCategoriesBelongToStore(storeId: Id, categoryIds: Id[]) {
    if (!categoryIds.length) return;
    const ownedCount = await this.prisma.category.count({
      where: { id: { in: categoryIds }, storeId, deletedAt: null },
    });
    if (ownedCount !== new Set(categoryIds).size)
      throw new BadRequestException(
        'Every scoped category must belong to the bundle store',
      );
  }

  private createData(bundleInput: CreateBundleDTO): Prisma.BundleCreateInput {
    const {
      paidServiceIds,
      paidCategoryIds,
      freeServiceIds,
      freeCategoryIds,
      storeId,
      ...bundle
    } = bundleInput;
    return {
      ...bundle,
      Store: { connect: { id: storeId } },
      ...this.scopesData(
        paidServiceIds ?? [],
        paidCategoryIds ?? [],
        freeServiceIds ?? [],
        freeCategoryIds ?? [],
        false,
      ),
    };
  }

  private updateData(
    bundleInput: UpdateBundleDTO,
    replaceScopes: boolean,
  ): Prisma.BundleUpdateInput {
    const {
      paidServiceIds,
      paidCategoryIds,
      freeServiceIds,
      freeCategoryIds,
      storeId,
      ...bundle
    } = bundleInput;
    return {
      ...bundle,
      ...(replaceScopes
        ? this.scopesData(
            paidServiceIds ?? [],
            paidCategoryIds ?? [],
            freeServiceIds ?? [],
            freeCategoryIds ?? [],
            true,
          )
        : {}),
    };
  }

  private scopesData(
    paidServiceIds: Id[],
    paidCategoryIds: Id[],
    freeServiceIds: Id[],
    freeCategoryIds: Id[],
    isUpdate: boolean,
  ) {
    const serviceRecords = [
      ...paidServiceIds.map((serviceId) => ({
        role: BundleScopeRole.PAID,
        Service: { connect: { id: serviceId } },
      })),
      ...freeServiceIds.map((serviceId) => ({
        role: BundleScopeRole.FREE,
        Service: { connect: { id: serviceId } },
      })),
    ];
    const categoryRecords = [
      ...paidCategoryIds.map((categoryId) => ({
        role: BundleScopeRole.PAID,
        Category: { connect: { id: categoryId } },
      })),
      ...freeCategoryIds.map((categoryId) => ({
        role: BundleScopeRole.FREE,
        Category: { connect: { id: categoryId } },
      })),
    ];
    return {
      ScopeServices: {
        ...(isUpdate ? { deleteMany: {} } : {}),
        create: serviceRecords,
      },
      ScopeCategories: {
        ...(isUpdate ? { deleteMany: {} } : {}),
        create: categoryRecords,
      },
    };
  }
}
