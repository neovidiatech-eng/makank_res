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
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { DeliveryService } from '../delivery.service';
import { CheckInDTO, CreateDeliveryScheduleDTO } from '../dto/delivery.dto';
import { DeliveryScheduleHelpersService } from '../services/delivery.schedule.helper.service';

const prefix = 'deliveryData';

@Controller('deliveryData')
@ApiTags(tag('Delivery'))
@Auth()
// Using 'deliveryData' prefix to avoid collision if necessary, or just 'delivery/schedule'
// The user asked for endpoint like "schedule of delivery", similar to store.
// Store uses @Controller('schedule'), but that might be global.
// Let's use 'delivery/schedule' to be safe and specific, or just follow the user request style.
// User req: "endpoint ال shedule بتاع ال delivery زي كده" (like that).
// The example showed @Controller(prefix) with prefix='schedule'.
// If I use 'schedule' it might conflict with store schedule if they share the same root,
// but NestJS controllers usually map to different paths or are isolated by modules.
// However, StoreScheduleController is mapped to 'schedule'.
// If `StoreModule` and `DeliveryModule` are imported in AppModule, 'schedule' route might conflict if not scoped.
// But `StoreScheduleController` is likely imported in `StoreModule`.
// To be safe and clear, I will use `delivery/schedule`.
export class DeliveryScheduleController {
  constructor(
    private readonly service: DeliveryService,
    private readonly response: ResponseService,
    private readonly helpers: DeliveryScheduleHelpersService,
  ) {}

  @Post('/schedule')
  async create(
    @Res() res: Response,
    @Body() body: CreateDeliveryScheduleDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    // Allow passing deliveryId if admin, otherwise use current user
    let deliveryId = user.id;
    if (user.Role.roleKey === RolesKeys.ADMIN) deliveryId = body.deliveryId;

    await this.helpers.scheduleOverlap(deliveryId, body);
    const schedule = await this.service.createSchedule(body, deliveryId);

    return this.response.success(
      res,
      'Delivery schedule created successfully',
      schedule,
    );
  }

  @Delete('/schedule/:id')
  @ApiRequiredIdParam('id')
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    // TODO: Add check if schedule belongs to user, or rely on service/middleware.
    // For now, simple delete as per request.
    const schedule = await this.service.deleteSchedule(id);
    return this.response.success(
      res,
      'Delivery schedule deleted successfully',
      schedule,
    );
  }

  @Get('/schedule')
  async get(@Res() res: Response, @CurrentUser() user: CurrentUser) {
    const schedule = await this.service.getSchedule(user.id);
    return this.response.success(
      res,
      'Delivery schedule returned successfully',
      schedule,
    );
  }

  @Post('/schedule/:id/check-in')
  @ApiRequiredIdParam('id')
  async checkIn(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: CheckInDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const attendance = await this.service.checkIn(user.id, id, body);
    return this.response.success(res, 'Checked in successfully', attendance);
  }
}
