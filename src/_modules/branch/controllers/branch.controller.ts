import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateBranchDTO,
  FilterBranchDTO,
  UpdateBranchDTO,
} from '../dto/branch.dto';
import { selectBranchOBJ } from '../prisma-args/branch.prisma.args';
import { BranchService } from '../services/branch.service';
import { UpdateBranchStatusDTO } from 'src/_modules/store/dto/store.dto';

const prefix = 'branches';

@Controller(prefix)
@ApiTags(tag(prefix))
export class BranchController {
  constructor(
    private readonly service: BranchService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  async create(
    @Res() res: Response,
    @Body() body: CreateBranchDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    if (user && user.storeId) {
      body.storeId = user.storeId;
    }
    const data = await this.service.create(body);
    return this.response.success(res, 'branch created successfully', data);
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'branch',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateBranchDTO,
  ) {
    await this.service.update(id, body);
    return this.response.success(res, 'branch updated successfully');
  }

  @Put('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'branch',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async updatePut(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateBranchDTO,
  ) {
    await this.service.update(id, body);
    return this.response.success(res, 'branch updated successfully');
  }

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Branches',
        paginated: true,
        body: [selectBranchOBJ()],
      },
      {
        title: 'Single Branch',
        paginated: false,
        body: selectBranchOBJ(),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterBranchDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Filter({ dto: FilterBranchDTO }) filters: FilterBranchDTO,
  ) {
    if (user && user.storeId) {
      filters.storeId = user.storeId;
    }
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'branch fetched successfully', data, {
      total,
    });
  }

  @Patch('/:id/status')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'branch',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async updateStatus(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateBranchStatusDTO,
  ) {
    await this.service.updateStatus(
      id,
      body.status,
      body.busyMinutes,
      body.statusReason,
    );
    return this.response.success(res, 'branch status updated successfully');
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'branch',
    ownerCurrentUserField: 'storeId',
    ownerFieldName: 'storeId',
  })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'branch deleted successfully');
  }
}
