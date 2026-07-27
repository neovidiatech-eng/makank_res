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
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateStoreTemplateDTO,
  CreateTemplateCategoryDTO,
  FilterStoreTemplateDTO,
  FilterTemplateCategoryDTO,
  UpdateStoreTemplateDTO,
  UpdateTemplateCategoryDTO,
} from './dto/store-template.dto';
import { StoreTemplateService } from './store-template.service';

const prefix = 'store-templates';

@Controller(prefix)
@ApiTags(tag(prefix))
export class StoreTemplateController {
  constructor(
    private readonly service: StoreTemplateService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  // Template's own `image` is uploaded as a file. `categories` is sent as a JSON
  // string (multipart); the DTO's field validators parse/coerce it (and treat an
  // empty string as absent), so no extra body-parsing interceptor is needed.
  @UploadFile('image', 'store-templates', undefined, {
    maxSize: 10 * 1024 * 1024,
  })
  async create(@Res() res: Response, @Body() body: CreateStoreTemplateDTO) {
    await this.service.create(body);
    return this.response.created(res, 'Store template created successfully');
  }

  // Literal routes below ("/categories", "/categories/:id") are registered before the
  // generic "/:id" template routes further down so Nest doesn't match "categories" as
  // a template id.

  @Get('/categories')
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterTemplateCategoryDTO) })
  @ApiOptionalIdParam('id')
  async findAllCategories(
    @Res() res: Response,
    @Filter({ dto: FilterTemplateCategoryDTO })
    filters: FilterTemplateCategoryDTO,
  ) {
    const data = await this.service.listTemplateCategories(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.countTemplateCategories(filters);
    return this.response.success(
      res,
      'Template categories fetched successfully',
      data,
      {
        total,
      },
    );
  }

  @Post('/:id/categories')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  // Category `image` uploaded as a file; nested `services` (if any) are parsed by the
  // DTO validators. Service images stay as strings for now.
  @UploadFile('image', 'store-templates', undefined, {
    maxSize: 10 * 1024 * 1024,
  })
  async addCategory(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: CreateTemplateCategoryDTO,
  ) {
    await this.service.addCategoryToTemplate(id, body);
    return this.response.created(
      res,
      'Category added to template successfully',
    );
  }

  @Patch('/categories/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  @UploadFile('image', 'store-templates', undefined, {
    maxSize: 10 * 1024 * 1024,
  })
  async updateCategory(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateTemplateCategoryDTO,
  ) {
    await this.service.updateTemplateCategory(id, body);
    return this.response.success(res, 'Template category updated successfully');
  }

  @Delete('/categories/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async deleteCategory(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.deleteTemplateCategory(id);
    return this.response.success(res, 'Template category deleted successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  @UploadFile('image', 'store-templates', undefined, {
    maxSize: 10 * 1024 * 1024,
  })
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateStoreTemplateDTO,
  ) {
    await this.service.update(id, body);
    return this.response.success(res, 'Store template updated successfully');
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'Store template deleted successfully');
  }

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterStoreTemplateDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterStoreTemplateDTO }) filters: FilterStoreTemplateDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.response.success(
      res,
      'Store templates fetched successfully',
      data,
      { total },
    );
  }
}
