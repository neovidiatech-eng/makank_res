import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { createWithId } from 'src/globals/helpers/dtoWithId';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateSpecialistDTO,
  FilterSpecialistDTO,
  UpdateSpecialistDTO,
} from './dto/specialist.dto';
import { SpecialistService } from './specialist.service';
const prefix = 'specialists';
@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class SpecialistController {
  constructor(
    private readonly service: SpecialistService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  async create(@Res() res: Response, @Body() dto: CreateSpecialistDTO) {
    await this.service.createSpecialist(dto);
    return this.response.created(res, 'Specialist Created');
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async updateSpecialist(
    @Res() res: Response,
    @Body() dto: UpdateSpecialistDTO,
    @Param() { id }: RequiredIdParam,
  ) {
    const body = createWithId(dto, id);
    await this.service.updateSpecialist(body);
    return this.response.success(res, 'Specialist updated successfully');
  }

  @Get(['/', '/:id'])
  @AttachStoreId()
  async getAll(@Res() res: Response, @Query() query: FilterSpecialistDTO) {
    const { data, total } = await this.service.getAll(query);
    return this.response.success(res, 'Data_returned_successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'Specialist Deleted Successfully');
  }
}
