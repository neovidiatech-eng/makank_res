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
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { ResponseService } from 'src/globals/services/response.service';
import { CreateVariationTemplateDTO } from './dto/variation-template.dto';
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
  async create(@Res() res: Response, @Body() body: CreateVariationTemplateDTO) {
    const data = await this.service.create(body);
    return this.response.created(
      res,
      'variation template created successfully',
      data,
    );
  }

  @Get('/')
  @Auth({ prefix, visitor: true })
  async findAll(@Res() res: Response) {
    const data = await this.service.findAll({});
    return this.response.success(
      res,
      'variation templates fetched successfully',
      data,
    );
  }

  @Get('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix, visitor: true })
  async findOne(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    const data = await this.service.findOne(id);
    return this.response.success(
      res,
      'variation template fetched successfully',
      data,
    );
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(
      res,
      'variation template deleted successfully',
    );
  }
}
