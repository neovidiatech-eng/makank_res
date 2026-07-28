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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { ServiceStatus } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { StripFieldsIfNoPermission } from 'src/decorators/api/permissionStripInterceptor.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateServiceDTO,
  FilterServiceDTO,
  UpdateServiceDTO,
} from '../dto/service.dto';
import { generateBulkUploadTemplate } from '../helpers/bulk-upload.helper';
import { AuthServiceInterceptor } from '../interceptors/auth.aervice.interceptor';
import { ServiceDTO } from '../interfaces/service.interface';
import { ServiceModuleService } from '../services/storeModule.service';

const prefix = 'services';

@Controller(prefix)
@ApiTags(tag(prefix))
export class ServiceModuleController {
  constructor(
    private readonly service: ServiceModuleService,
    private readonly response: ResponseService,
  ) {}

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Services For Visitors',
        paginated: true,
        body: [new ServiceDTO()],
      },
      {
        title: 'Get All Services For Customers',
        paginated: true,
        body: [{ ...new ServiceDTO(), Favorites: [] }],
      },
      {
        title: 'Single Service For Visitors',
        paginated: false,
        body: new ServiceDTO(),
      },
      {
        title: 'Single Service For Customers',
        paginated: false,
        body: [{ ...new ServiceDTO(), Favorites: [] }],
      },
    ]),
  )
  @UseInterceptors(AuthServiceInterceptor)
  // Without this, a Store-role caller hitting plain GET /services (no
  // ?storeId=) got back services from every store on the platform instead of
  // just their own — the menu screen showed random other stores' products on
  // a brand-new store that hadn't added anything yet. AttachStoreId's GET
  // branch force-sets filters.storeId from the JWT for Role.roleKey === STORE
  // only; visitor/customer/admin callers are unaffected.
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterServiceDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterServiceDTO }) filters: FilterServiceDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'service fetched successfully', data, {
      total,
    });
  }
  @Post('/')
  @Auth({ prefix })
  @AttachStoreId()
  @UploadFile('image', 'service')
  async create(
    @Res() res: Response,
    @Body() body: CreateServiceDTO,
    @CurrentUser('Role') role: CurrentUser['Role'],
  ) {
    // Moderation gate: only an Admin may set the initial status. Anyone else
    // (store owners) has it forced to PENDING so new services await approval —
    // the DTO field is optional and the DB defaults to PENDING regardless.
    if (role?.roleKey !== RolesKeys.ADMIN) {
      body.status = ServiceStatus.PENDING;
    }
    await this.service.create(body);
    return this.response.created(res, 'service created successfully');
  }
  @Patch('/:id')
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'service',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  @ApiRequiredIdParam('id')
  @AttachStoreId()
  @UploadFile('image', 'service')
  // `available` (in-stock/hidden toggle) stays store-editable — only `status`
  // (moderation: PENDING/ACTIVE/REJECTED) requires the `manage` permission,
  // same gate `create()` already enforces on the initial value above.
  @StripFieldsIfNoPermission({
    prefix,
    restrictedFields: ['status'],
    method: 'manage',
  })
  async update(
    @Res() res: Response,
    @Body() body: UpdateServiceDTO,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.update(id, body, user);
    return this.response.created(res, 'service updated successfully');
  }
  @Delete('/:id')
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'service',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  @ApiRequiredIdParam('id')
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.created(res, 'service deleted successfully');
  }

  // Blank Excel template with the exact columns bulk-upload expects, plus one
  // worked example row — so the store never has to guess the column names.
  @Get('/bulk-upload/template')
  @Auth({ prefix })
  async downloadBulkUploadTemplate(@Res() res: Response) {
    const buffer = await generateBulkUploadTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products-template.xlsx"',
    });
    res.send(buffer);
  }

  // One row per product (name/price/category — images are added per-product
  // afterward through the normal edit screen, not part of this file). One
  // bad row never blocks the rest; the response lists exactly which rows
  // succeeded/failed and why.
  @Post('/bulk-upload')
  @Auth({ prefix })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async bulkUpload(
    @Res() res: Response,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { storeId?: number },
    @CurrentUser() user: CurrentUser,
  ) {
    if (!file) {
      throw new BadRequestException('ملف الإكسل مطلوب');
    }
    // Not using @AttachStoreId() here — multer parses the multipart body
    // inside FileInterceptor, so an interceptor mutating req.body ahead of
    // that would be mutating it before the fields even exist. Resolved
    // explicitly instead: a Store-role caller always uses their own store;
    // only Admin may (and must) pass storeId explicitly.
    const storeId =
      user.Role?.roleKey === RolesKeys.STORE ? user.storeId : body.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId is required');
    }
    const summary = await this.service.bulkUploadFromExcel(
      storeId,
      file.buffer,
      user,
    );
    return this.response.success(
      res,
      'bulk product upload processed',
      summary,
    );
  }
}
