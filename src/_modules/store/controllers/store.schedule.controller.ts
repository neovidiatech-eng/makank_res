import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { CanUserAccessModelRowId } from 'src/decorators/api/CanUserAccessModelRowId.decorator';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { tag } from 'src/globals/helpers/tag.helper';
import { GlobalHelpers } from 'src/globals/services/globalHelpers.service';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateScheduleDTO,
  RequiredIdDateParam,
  UpdateStoreScheduleDTO,
} from '../dto/store.schedule.dto';
import { ScheduleHelpersService } from '../services/store.schedule.helper.service';
import { ScheduleService } from '../services/store.schedule.service';

const prefix = 'schedule';

@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class StoreScheduleController {
  constructor(
    private readonly service: ScheduleService,
    private readonly response: ResponseService,
    private readonly helpers: ScheduleHelpersService,
    private readonly globalHelpers: GlobalHelpers,
  ) {}

  @Post('/')
  async create(
    @Res() res: Response,
    @Body() body: CreateScheduleDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    if (user?.branchId) body.branchId = user.branchId;
    await this.helpers.scheduleOverlap(body.branchId, body);
    const schedule = await this.service.createSchedule(body);

    return this.response.success(
      res,
      'store schedule created successfully',
      schedule,
    );
  }
  @Delete('/:id')
  @ApiRequiredIdParam('id')
  @CanUserAccessModelRowId({
    prefix,
    modelName: 'storeSchedule',
    ownerCurrentUserField: 'branchId',
    ownerFieldName: 'branchId',
  })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    const schedule = await this.service.deleteSchedule(id);
    return this.response.success(
      res,
      'store schedule deleted successfully',
      schedule,
    );
  }
  @Get('/')
  @ApiOperation({ summary: 'Get current store schedules' })
  async getMySchedules(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
  ) {
    if (!user?.branchId) throw new BadRequestException('Branch ID is required');
    const schedule = await this.globalHelpers.getStoreAvailableDays(
      user.branchId,
      true,
    );
    return this.response.success(
      res,
      'store schedule returned successfully',
      schedule,
    );
  }

  @Get('/:id/:date')
  @ApiRequiredIdParam('id')
  @ApiParam({
    name: 'date',
    type: Date,
    required: true,
  })
  async getServiceSchedule(
    @Res() res: Response,
    @Param() { id, date }: RequiredIdDateParam,
  ) {
    const schedule = await this.globalHelpers.getServiceSchedule(id, date);
    return this.response.success(
      res,
      'store schedule returned successfully',
      schedule,
    );
  }
  @Get('/:id')
  @ApiRequiredIdParam('id')
  async getStoreAvailableDays(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
  ) {
    const schedule = await this.globalHelpers.getStoreAvailableDays(id);
    return this.response.success(
      res,
      'store schedule returned successfully',
      schedule,
    );
  }

  @Put('bulk')
  @ApiOperation({ summary: 'Update multiple store schedules' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  async updateMulti(
    @Res() res: Response,
    @Body() body: UpdateStoreScheduleDTO,
    @CurrentUser() user: CurrentUser,
    @Query('branchId') queryBranchId?: string,
  ) {
    let targetBranchId = user.branchId;

    if (user.Role.roleKey === RolesKeys.ADMIN) {
      const parsedQueryId = queryBranchId ? parseInt(queryBranchId, 10) : undefined;
      const bodyBranchId = body.schedules?.[0]?.branchId;
      targetBranchId = parsedQueryId || bodyBranchId || (body as any).branchId;
    }

    if (!targetBranchId) {
      throw new BadRequestException('Branch ID is required');
    }

    await this.service.updateSchedules(targetBranchId, body);
    return this.response.success(res, 'Store schedules updated successfully');
  }
}
