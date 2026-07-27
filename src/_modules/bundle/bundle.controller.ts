import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { BundleService } from './bundle.service';
import {
  CreateBundleDTO,
  FilterBundleDTO,
  UpdateBundleDTO,
} from './dto/bundle.dto';
import { selectBundleOBJ } from './prisma-args/bundle.prisma.args';

const prefix = 'bundles';

@Controller(prefix)
@ApiTags(tag(prefix))
export class BundleController {
  constructor(
    private readonly service: BundleService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @AttachStoreId({ storeIdOptionalForManagementUser: true })
  @UploadFile('image', 'bundle')
  async create(
    @Res() response: Response,
    @Body() bundleInput: CreateBundleDTO,
  ) {
    await this.service.create(bundleInput);
    return this.response.created(response, 'bundle created successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @AttachStoreId()
  @ApiRequiredIdParam()
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'bundle',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  @UploadFile('image', 'bundle')
  async update(
    @Res() response: Response,
    @Param() { id }: RequiredIdParam,
    @Body() bundleInput: UpdateBundleDTO,
  ) {
    await this.service.update(id, bundleInput);
    return this.response.created(response, 'bundle updated successfully');
  }

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @AttachStoreId()
  @ApiOkResponse(
    buildExamples([
      { title: 'Get Bundles', paginated: true, body: [selectBundleOBJ()] },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterBundleDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() response: Response,
    @Filter({ dto: FilterBundleDTO }) filters: FilterBundleDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const isPrivileged = [RolesKeys.STORE, RolesKeys.ADMIN].includes(
      user?.Role?.roleKey,
    );
    // Bundles are primarily surfaced on the store profile. The standalone list must stay
    // store-scoped for customers/visitors — requiring a storeId (or a single :id) prevents an
    // accidental public "all platform bundles" catalogue. Store users are auto-scoped by
    // @AttachStoreId; admins may browse across stores intentionally.
    if (!isPrivileged && !filters.id && !filters.storeId)
      throw new BadRequestException('storeId is required to list bundles');
    const includeInactive = isPrivileged;
    const bundles = await this.service.findAll(filters, includeInactive);
    const total = isOne(filters.id)
      ? undefined
      : await this.service.count(filters, includeInactive);
    return this.response.success(
      response,
      'bundle fetched successfully',
      bundles,
      { total },
    );
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'bundle',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async delete(@Res() response: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(response, 'bundle deleted successfully');
  }
}
