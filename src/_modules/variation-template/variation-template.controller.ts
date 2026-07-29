import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateVariationTemplateDTO,
  FilterVariationTemplateDTO,
} from './dto/variation-template.dto';
import { VariationTemplateService } from './variation-template.service';

const prefix = 'variation-templates';

@Controller(prefix)
@ApiTags(prefix)
export class VariationTemplateController {
  constructor(
    private readonly service: VariationTemplateService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @AttachStoreId({ storeIdOptionalForManagementUser: true })
  async create(@Res() res: Response, @Body() body: CreateVariationTemplateDTO) {
    const data = await this.service.create(body);
    return this.response.created(
      res,
      'variation template created successfully',
      data,
    );
  }

  // Visible to a Store-role caller: every global (admin-defined) preset PLUS
  // their own private ones — never another store's private presets.
  @Get('/')
  @Auth({ prefix, visitor: true })
  @AttachStoreId()
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterVariationTemplateDTO }) filters: FilterVariationTemplateDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.findAll(filters, user);
    return this.response.success(
      res,
      'variation templates fetched successfully',
      data,
    );
  }

  // Same visibility rule as the list: a Store-role caller can read a global
  // preset or their own, never another store's private one by guessing its id.
  @Get('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix, visitor: true })
  async findOne(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.findOne(id, user);
    return this.response.success(
      res,
      'variation template fetched successfully',
      data,
    );
  }

  // A store may only delete its own private presets — never a global
  // (admin-defined) one, and never another store's.
  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.delete(id, user);
    return this.response.success(
      res,
      'variation template deleted successfully',
    );
  }
}
