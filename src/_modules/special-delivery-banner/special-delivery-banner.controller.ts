import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { SpecialDeliveryBannerService } from './special-delivery-banner.service';
import {
  CreateSpecialDeliveryBannerDTO,
  FilterSpecialDeliveryBannerDTO,
  UpdateSpecialDeliveryBannerDTO,
} from './dto/special-delivery-banner.dto';

import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Auth } from '../authentication/decorators/auth.decorator';
import { CurrentUser } from '../authentication/decorators/current-user.decorator';
import { RolesKeys } from '../authorization/providers/roles';

const prefix = 'special-delivery-banners';

@Controller(prefix)
@ApiTags(tag(prefix))
export class SpecialDeliveryBannerController {
  constructor(
    private readonly service: SpecialDeliveryBannerService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @UploadFile('image', 'special-delivery-banner', undefined, {})
  async create(
    @Res() res: Response,
    @Body() body: CreateSpecialDeliveryBannerDTO,
  ) {
    await this.service.create(body);
    return this.response.created(
      res,
      'special delivery banner created successfully',
    );
  }

  // Public click tracking. Visitor auth (no permission gate) so customers can
  // report taps. Increments clickCount atomically; 404 if the banner is gone.
  @Post('/:id/click')
  @Auth({ prefix, visitor: true })
  @ApiRequiredIdParam()
  async click(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.trackClick(id);
    return this.response.success(
      res,
      'special delivery banner click tracked successfully',
    );
  }

  @Patch('/:id')
  @UploadFile('image', 'special-delivery-banner', undefined, {})
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateSpecialDeliveryBannerDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(
      res,
      'special delivery banner updated successfully',
    );
  }

  // Admin statistics: banner name + click count. Declared before GET '/:id'
  // so the literal path is not captured by the id route.
  @Get('/statistics')
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterSpecialDeliveryBannerDTO) })
  async statistics(
    @Res() res: Response,
    @Filter({ dto: FilterSpecialDeliveryBannerDTO }) filters: FilterSpecialDeliveryBannerDTO,
  ) {
    const data = await this.service.statistics(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(
      res,
      'special delivery banner statistics fetched successfully',
      data,
      {
        total,
      },
    );
  }

  // Helper for the create/update UI: which zones the admin may pick for a
  // banner targeting this store (union of the store branches' zones).
  @Get('/store/:storeId/zones')
  @Auth({ prefix })
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
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterSpecialDeliveryBannerDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterSpecialDeliveryBannerDTO }) filters: FilterSpecialDeliveryBannerDTO,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const isCustomer =
      !currentUser || currentUser.Role.roleKey === RolesKeys.CUSTOMER;
    const data = await this.service.findAll(filters, isCustomer, currentUser);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(
      res,
      'special delivery banner fetched successfully',
      data,
      {
        total,
      },
    );
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(
      res,
      'delete special delivery banner successfully',
    );
  }
}
