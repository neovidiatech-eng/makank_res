import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { BannerService } from './banner.service';
import {
  CreateBannerDTO,
  FilterBannerDTO,
  UpdateBannerDTO,
} from './dto/banner.dto';

import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Auth } from '../authentication/decorators/auth.decorator';
import { CurrentUser } from '../authentication/decorators/current-user.decorator';
import { RolesKeys } from '../authorization/providers/roles';

const authPrefix = 'banners';

/** Returns true when the request came through one of the
 *  special-delivery-banners/* aliases so we can auto-scope targetType. */
const isSpecialDeliveryRoute = (req: Request): boolean =>
  /special-delivery/i.test(req.path + req.url);

@Controller([
  'banners',
  'banner',
  'special-delivery-banners',
  'special-delivery-banner',
])
@ApiTags(tag(authPrefix))
export class BannerController {
  constructor(
    private readonly service: BannerService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix: authPrefix })
  @UploadFile('image', 'banner', undefined, {
    // disallowedTypes: ['image/svg+xml'],
  })
  async create(@Res() res: Response, @Body() body: CreateBannerDTO) {
    await this.service.create(body);
    return this.response.created(res, 'banner created successfully');
  }

  // Public click tracking. Visitor auth (no permission gate) so customers can
  // report taps. Increments clickCount atomically; 404 if the banner is gone.
  @Post('/:id/click')
  @Auth({ prefix: authPrefix, visitor: true })
  @ApiRequiredIdParam()
  async click(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.trackClick(id);
    return this.response.success(res, 'banner click tracked successfully');
  }

  @Patch('/:id')
  @UploadFile('image', 'banner', undefined, {
    // disallowedTypes: ['image/svg+xml'],
  })
  @ApiRequiredIdParam()
  @Auth({ prefix: authPrefix })
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateBannerDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'banner updated successfully');
  }

  // Admin statistics: banner name + click count. Declared before GET '/:id'
  // so the literal path is not captured by the id route.
  @Get('/statistics')
  @Auth({ prefix: authPrefix })
  @ApiQuery({ type: PartialType(FilterBannerDTO) })
  async statistics(
    @Res() res: Response,
    @Filter({ dto: FilterBannerDTO }) filters: FilterBannerDTO,
  ) {
    const data = await this.service.statistics(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(
      res,
      'banner statistics fetched successfully',
      data,
      {
        total,
      },
    );
  }

  // Helper for the create/update UI: which zones the admin may pick for a
  // banner targeting this store (union of the store branches' zones).
  @Get('/store/:storeId/zones')
  @Auth({ prefix: authPrefix })
  async allowedZones(
    @Res() res: Response,
    @Param('storeId', ParseIntPipe) storeId: number,
  ) {
    const data = await this.service.getAllowedZonesForStore(storeId);
    return this.response.success(
      res,
      'allowed zones fetched successfully',
      data,
    );
  }

  @Get(['/', '/:id'])
  @Auth({ prefix: authPrefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterBannerDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Filter({ dto: FilterBannerDTO }) filters: FilterBannerDTO,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const isCustomer =
      !currentUser || currentUser.Role.roleKey === RolesKeys.CUSTOMER;

    // Detect which route family was used and pass that as a scoping flag.
    // The service/args layer will then auto-restrict targetType accordingly.
    const specialDelivery = isSpecialDeliveryRoute(req);

    const data = await this.service.findAll(
      filters,
      isCustomer,
      currentUser,
      specialDelivery,
    );
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters, specialDelivery);

    return this.response.success(res, 'banner fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @Auth({ prefix: authPrefix })
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete banner successfully');
  }
}
