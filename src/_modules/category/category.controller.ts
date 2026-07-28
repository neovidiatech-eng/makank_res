import {
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
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { ResponseService } from 'src/globals/services/response.service';

import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { CategoryService } from './category.service';
import {
  CreateCategoryDTO,
  FilterCategoryDTO,
  UpdateCategoryDTO,
} from './dto/category.dto';
import { selectCategoryOBJ } from './prisma-args/category.prisma.args';

const prefix = 'categories';

@Controller(prefix)
@ApiTags(tag(prefix))
export class CategoryController {
  constructor(
    private readonly service: CategoryService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @AttachStoreId({
    storeIdOptionalForManagementUser: true,
  })
  @UploadFile('image', 'image')
  async create(@Res() res: Response, @Body() body: CreateCategoryDTO) {
    await this.service.create(body);
    return this.response.created(res, 'category created successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @AttachStoreId()
  @ApiRequiredIdParam()
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'category',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  @UploadFile('image', 'image')
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateCategoryDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'category updated successfully');
  }
  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Categories',
        paginated: true,
        body: [selectCategoryOBJ()],
      },
      {
        title: 'Single Category',
        paginated: false,
        body: selectCategoryOBJ(),
      },
    ]),
  )
  @Auth({ prefix, visitor: true })
  // Without this, a Store-role caller hitting plain GET /categories (no
  // ?storeId=) got back every store's categories instead of just their own —
  // same class of leak as GET /services. AttachStoreId's GET branch
  // force-sets filters.storeId from the JWT only for Role.roleKey === STORE.
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterCategoryDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterCategoryDTO }) filters: FilterCategoryDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'category fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'category',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete category successfully');
  }
}
