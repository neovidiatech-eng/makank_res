import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { OTPType, SessionType, User } from '@prisma/client';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { IpAddress } from 'src/_modules/authentication/decorators/ip.decorator';
import { TokenService } from 'src/_modules/authentication/services/jwt.service';
import { OTPService } from 'src/_modules/authentication/services/otp.service';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { StripFieldsIfNoPermission } from 'src/decorators/api/permissionStripInterceptor.decorator';
import { UploadMultipleFiles } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { MergeStoreNameOnUpdate } from '../interceptors/merge-store-name.interceptor';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { ServiceModuleService } from '../../serviceModule/services/storeModule.service';
import { ApplyTemplateDTO } from '../../store-template/dto/store-template.dto';
import { StoreTemplateService } from '../../store-template/store-template.service';
import {
  ApplyStoreDiscountDTO,
  CreateStoreDTO,
  FilterStoreDTO,
  RemoveStoreDiscountDTO,
  SetStoreApprovalDTO,
  SetStoreZonePricesDTO,
  ToggleStoreManagedByAdminDTO,
  ToggleStoreZonePricingDTO,
  UpdateBranchStatusDTO,
  UpdateStoreCommissionDTO,
  UpdateStoreDTO,
} from '../dto/store.dto';
import { AuthStoreInterceptor } from '../interceptors/auth.store.interceptor';
import { selectStoreOBJ } from '../prisma-args/store.prisma.args';
import { StoreService } from '../services/store.service';

const prefix = 'stores';

@Controller(prefix)
@ApiTags(tag(prefix))
export class StoreController {
  constructor(
    private readonly service: StoreService,
    private readonly serviceModuleService: ServiceModuleService,
    private readonly storeTemplateService: StoreTemplateService,
    private readonly response: ResponseService,
    private readonly OTPService: OTPService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('/')
  @UploadMultipleFiles([
    {
      name: 'logo',
      fileType: 'image',
      required: false,
    },
    {
      name: 'cover',
      fileType: 'image',
      required: false,
    },
  ])
  @Auth({ prefix, visitor: true })
  async create(
    @Res() res: Response,
    @Body() body: CreateStoreDTO,
    @IpAddress() ip: string,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const user = await this.service.create(body, currentUser);
    await this.OTPService.generateOTP(user.id, OTPType.EMAIL_VERIFICATION);
    const token = await this.tokenService.generateToken(
      user.id,
      ip,
      undefined,
      SessionType.VERIFY,
    );
    return this.response.success(res, 'store created successfully', {
      user,
      token,
    });
  }
  @Patch('/:id/status')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'store',
    indirectRelation: true,
  })
  async updateStatus(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateBranchStatusDTO,
  ) {
    await this.service.updateBranchStatus(
      id,
      body.status,
      body.busyMinutes,
      body.statusReason,
    );
    return this.response.success(res, 'store status updated successfully');
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'store',
    indirectRelation: true,
  })
  @StripFieldsIfNoPermission({
    prefix,
    // isStoreAccepted/isBlocked/isVerified must only ever move through the admin
    // approval/block flows below — otherwise a store owner could PATCH their own
    // profile to self-approve, self-unblock, or self-verify.
    restrictedFields: [
      'status',
      'isStoreAccepted',
      'isBlocked',
      'isVerified',
      'zonePricingEnabled',
      'managedByAdmin',
      // deliveryTimeMinMinutes/deliveryTimeMaxMinutes and prepTimeMinutes are
      // deliberately NOT in this list — the store sets its own delivery-time
      // estimate and prep time, same self-service level.
    ],
    method: 'manage',
  })
  @UploadMultipleFiles([
    {
      name: 'logo',
      fileType: 'image',
      required: false,
    },
    {
      name: 'cover',
      fileType: 'image',
      required: false,
    },
  ])
  @MergeStoreNameOnUpdate()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateStoreDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'store updated successfully');
  }

  @Patch('/:id/block')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'store-block' })
  async block(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.block(id);
    return this.response.success(res, 'store blocked successfully');
  }

  @Patch('/:id/approval')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'store-approval' })
  async setApproval(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() { approved, reason }: SetStoreApprovalDTO,
  ) {
    await this.service.setApproval(id, approved, reason);
    return this.response.success(res, 'store approval updated successfully');
  }

  @Patch('/:id/commission')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'store-commission' })
  async updateCommission(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() { commission, commissionType }: UpdateStoreCommissionDTO,
  ) {
    await this.service.updateCommission(id, commission, commissionType);
    return this.response.success(res, 'store commission updated successfully');
  }

  // Admin-only — lets a specific store set its own per-zone delivery prices
  // (never exposed on PATCH /stores/:id itself, see restrictedFields there).
  @Patch('/:id/zone-pricing/toggle')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'store-zone-pricing' })
  async toggleZonePricing(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() { enabled }: ToggleStoreZonePricingDTO,
  ) {
    await this.service.toggleZonePricing(id, enabled);
    return this.response.success(
      res,
      'store zone pricing toggled successfully',
    );
  }

  // Admin-only — marks a store as run entirely from the admin dashboard (no
  // staff using the store app), so new-order notifications route to Admin
  // users too instead of relying on branch staff who don't exist.
  @Patch('/:id/managed-by-admin/toggle')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'store-managed-by-admin' })
  async toggleManagedByAdmin(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() { enabled }: ToggleStoreManagedByAdminDTO,
  ) {
    await this.service.toggleManagedByAdmin(id, enabled);
    return this.response.success(
      res,
      'store managed-by-admin flag toggled successfully',
    );
  }

  // Store self-service (also reachable by admin) — apply one discount (percentage
  // or fixed amount) across the store's entire catalog in a single call, instead
  // of editing every service one by one. Overwrites any existing per-service
  // discount. Skips (and reports) any line that would go negative or non-discounted
  // rather than ever writing an invalid price.
  @Patch('/:id/discount')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'store',
    indirectRelation: true,
  })
  async applyDiscount(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: ApplyStoreDiscountDTO,
  ) {
    const data = await this.service.applyStoreDiscount(
      id,
      body.discountType,
      body.value,
      body.categoryId,
    );
    return this.response.success(
      res,
      'store discount applied successfully',
      data,
    );
  }

  // Clears every discount this endpoint (or manual per-service edits) set —
  // reverts the whole catalog (or just one category, if given) back to full price.
  @Patch('/:id/discount/remove')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'store',
    indirectRelation: true,
  })
  async removeDiscount(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: RemoveStoreDiscountDTO,
  ) {
    await this.service.removeStoreDiscount(id, body.categoryId);
    return this.response.success(res, 'store discount removed successfully');
  }

  // Customer/visitor-facing — the price that will ACTUALLY be charged per zone
  // for a regular order from this specific store (store's own price if
  // enabled+set, else the app-wide zone price, else null = km-formula). Use
  // this to populate the zone dropdown while the customer is ordering from
  // this store — GET /zones is store-agnostic and won't reflect this store's
  // own overrides.
  @Get(['/me/effective-zone-prices', '/effective-zone-prices', '/:id/effective-zone-prices'])
  @Auth({ prefix, visitor: true })
  async getEffectiveZonePrices(
    @Res() res: Response,
    @Param('id') id: string | undefined,
    @CurrentUser() user: CurrentUser,
  ) {
    const targetId = id ?? (user?.storeId ? String(user.storeId) : 'me');
    const data = await this.service.getEffectiveZonePrices(targetId, user);
    return this.response.success(res, 'store effective zone prices fetched successfully', data);
  }

  @Get(['/me/zone-prices', '/zone-prices', '/:id/zone-prices'])
  @Auth({ prefix })
  async getZonePrices(
    @Res() res: Response,
    @Param('id') id: string | undefined,
    @CurrentUser() user: CurrentUser,
  ) {
    const targetId = id ?? (user?.storeId ? String(user.storeId) : 'me');
    const data = await this.service.getZonePrices(targetId, user);
    return this.response.success(
      res,
      'store zone prices fetched successfully',
      data,
    );
  }

  @Patch(['/me/zone-prices', '/zone-prices', '/:id/zone-prices'])
  @Auth({ prefix })
  async setZonePrices(
    @Res() res: Response,
    @Param('id') id: string | undefined,
    @Body() body: any,
    @CurrentUser() user: CurrentUser,
  ) {
    const targetId = id ?? (user?.storeId ? String(user.storeId) : 'me');
    const data = await this.service.setZonePrices(targetId, body, user);
    return this.response.success(res, 'store zone prices updated successfully', data);
  }

  @Delete(['/me/zone-prices/:zoneId', '/zone-prices/:zoneId', '/:id/zone-prices/:zoneId'])
  @Auth({ prefix })
  async deleteZonePrice(
    @Res() res: Response,
    @Param('id') id: string | undefined,
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @CurrentUser() user: CurrentUser,
  ) {
    const targetId = id ?? (user?.storeId ? String(user.storeId) : 'me');
    const data = await this.service.deleteZonePrice(targetId, zoneId, user);
    return this.response.success(res, 'store zone price removed successfully', data);
  }

  @Get('me')
  @Auth({ prefix })
  async getMyStore(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
  ) {
    if (!user.storeId) {
      throw new BadRequestException('Store ID not found for this user');
    }
    const store = await this.service.findAll({ id: user.storeId } as FilterStoreDTO);
    return this.response.success(res, 'Store fetched successfully', store);
  }

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Stores For Visitors',
        paginated: true,
        body: [selectStoreOBJ()],
      },
      {
        title: 'Get All Stores For Customers',
        paginated: true,
        body: [{ ...selectStoreOBJ(), Favorites: [] }],
      },
      {
        title: 'Single Store For Visitors',
        paginated: false,
        body: selectStoreOBJ(),
      },
      {
        title: 'Single Store For Customers',
        paginated: false,
        body: [{ ...selectStoreOBJ(), Favorites: [] }],
      },
    ]),
  )
  @UseInterceptors(AuthStoreInterceptor)
  @ApiQuery({ type: PartialType(FilterStoreDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterStoreDTO }) filters: FilterStoreDTO,
    @CurrentUser() user: User,
  ) {
    if (user && user.roleKey === RolesKeys.CUSTOMER)
      filters.customerId = user.id;
    const data = await this.service.findAll(filters, user ? false : true);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters, user ? false : true);

    return this.response.success(res, 'store fetched successfully', data, {
      total,
    });
  }

  @Get('/:id/products')
  @Auth({ prefix, visitor: true })
  @ApiRequiredIdParam()
  async findProducts(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.serviceModuleService.findGroupedByStore(
      id,
      user?.id,
      user?.Role.roleKey,
    );
    return this.response.success(res, 'products fetched successfully', data);
  }

  @Post('/:id/apply-template')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async applyTemplate(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: ApplyTemplateDTO,
  ) {
    await this.storeTemplateService.applyToStore(id, body);
    return this.response.success(res, 'Template applied to store successfully');
  }

  @Delete('/:id/apply-template/:templateId')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async removeTemplate(
    @Res() res: Response,
    // Plain @Param(key) here, not @Param() with the RequiredIdParam DTO — with two
    // route params present (:id and :templateId), whole-object DTO validation sees
    // both and rejects templateId as an unrecognized property on RequiredIdParam.
    @Param('id', ParseIntPipe) id: number,
    @Param('templateId', ParseIntPipe) templateId: number,
  ) {
    await this.storeTemplateService.removeFromStore(id, templateId);
    return this.response.success(
      res,
      'Template removed from store successfully',
    );
  }

  @Get('/:id/applied-templates')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async getAppliedTemplates(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
  ) {
    const data = await this.storeTemplateService.getAppliedTemplates(id);
    return this.response.success(
      res,
      'Applied templates fetched successfully',
      data,
    );
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete store successfully');
  }
}
