import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import {
  CreateDeliveryDTO,
  DeliveryScheduleDTO,
  GetDeliveriesDTO,
  GetDeliveryStatisticsDTO,
  GetDriverDashboardDTO,
  UpdateDeliveryDTO,
  UpdateDeliveryLocationDTO,
} from './dto/delivery.dto';

import { OrderType, OTPType, SessionType } from '@prisma/client';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { IpAddress } from 'src/_modules/authentication/decorators/ip.decorator';
import { TokenService } from 'src/_modules/authentication/services/jwt.service';
import { OTPService } from 'src/_modules/authentication/services/otp.service';
import { ResponseService } from 'src/globals/services/response.service';
import { WalletService } from '../wallet/wallet.service';
import { OrderService } from '../order/order.service';

@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly OTPService: OTPService,
    private readonly tokenService: TokenService,
    private readonly responses: ResponseService,
    private readonly orderService: OrderService,
    private readonly walletService: WalletService,
  ) {}

  @Get('me/current-assignment')
  @ApiOperation({ summary: 'Get current assigned order for delivery' })
  @Auth()
  async getCurrentAssignment(
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    const data = await this.orderService.getCurrentAssignment(userId);
    return this.responses.success(
      res,
      'Current assignment fetched successfully',
      data,
    );
  }

  @Get('me/pending-assignments')
  @ApiOperation({ summary: 'Get all pending assignments for delivery' })
  @ApiQuery({
    name: 'type',
    enum: OrderType,
    required: false,
    description: 'Filter pending assignments by order type',
  })
  @Auth()
  async getPendingAssignments(
    @CurrentUser('id') userId: number,
    @Res() res: Response,
    @Query('type') type?: OrderType,
  ) {
    const data = await this.orderService.getPendingAssignments(userId, type);
    return this.responses.success(
      res,
      'Pending assignments fetched successfully',
      data,
    );
  }

  @Patch('me/assignments/accept')
  @ApiOperation({ summary: 'Accept all pending assignments for delivery' })
  @Auth()
  async acceptAllPendingAssignments(
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    const data = await this.orderService.acceptAllPendingAssignments(userId);
    return this.responses.success(
      res,
      'Pending assignments accepted successfully',
      data,
    );
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new delivery person' })
  @Auth({ visitor: true, prefix: 'delivery/register' })
  async register(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() data: CreateDeliveryDTO,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const user = await this.deliveryService.create(data, currentUser);
    await this.OTPService.generateOTP(user.id, OTPType.EMAIL_VERIFICATION);

    const token = !currentUser
      ? await this.tokenService.generateToken(
          user.id,
          ip,
          undefined,
          SessionType.VERIFY,
        )
      : undefined;

    return this.responses.success(
      res,
      'Delivery person registered successfully',
      {
        user,
        token,
      },
    );
  }
  @Get('all')
  @ApiOperation({ summary: 'Get all delivery persons' })
  @Auth({ prefix: 'delivery' })
  async getAll(@Res() res: Response, @Query() query: GetDeliveriesDTO) {
    const { data, count } = await this.deliveryService.findAll(query);
    return this.responses.success(
      res,
      'Deliveries fetched successfully',
      data,
      {
        total: count,
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Driver Management listing (cards) with pagination & search',
  })
  @Auth({ prefix: 'delivery' })
  async list(@Res() res: Response, @Query() query: GetDeliveriesDTO) {
    const { data, pagination } =
      await this.deliveryService.findAllForDashboard(query);
    return this.responses.success(
      res,
      'Deliveries fetched successfully',
      data,
      {
        total: pagination.total,
        pagination,
      },
    );
  }

  @Get('me/dashboard')
  @ApiOperation({
    summary: 'Logged-in driver dashboard (stats, financials & orders)',
  })
  @Auth()
  async getMyDashboard(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Query() query: GetDriverDashboardDTO,
  ) {
    const data = await this.deliveryService.getDriverDashboard(user.id, query);
    return this.responses.success(
      res,
      'Driver dashboard fetched successfully',
      data,
    );
  }

  @Get(':id/dashboard')
  @ApiOperation({
    summary: 'Driver details dashboard (stats, financials & orders) for a day',
  })
  @Auth()
  async dashboard(
    @Res() res: Response,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUser,
    @Query() query: GetDriverDashboardDTO,
  ) {
    const targetId = id === 'me' ? user.id : +id;
    const data = await this.deliveryService.getDriverDashboard(targetId, query);
    return this.responses.success(
      res,
      'Driver dashboard fetched successfully',
      data,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery person profile' })
  @Auth()
  async findOne(@Param('id') id: string) {
    return this.deliveryService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update delivery person' })
  @Auth({ prefix: 'delivery' })
  async update(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() data: UpdateDeliveryDTO,
  ) {
    const user = await this.deliveryService.update(+id, data);
    return this.responses.success(
      res,
      'Delivery person updated successfully',
      user,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete delivery person' })
  @Auth({ prefix: 'delivery' })
  async remove(@Res() res: Response, @Param('id') id: string) {
    await this.deliveryService.remove(+id);
    return this.responses.success(res, 'Delivery person deleted successfully');
  }

  // Full reset for one driver's wallet/cash-custody figures back to zero
  // (e.g. after heavy test-order activity left it in a meaningless state).
  // Any still-PENDING withdrawal request for this driver is auto-denied so
  // it can't later be approved against a balance that no longer backs it.
  // Transaction ledger history is left untouched on purpose.
  @Patch(':id/reset-wallet')
  @ApiOperation({ summary: "Reset a driver's wallet to zero" })
  @Auth({ prefix: 'delivery' })
  async resetWallet(@Res() res: Response, @Param('id') id: string) {
    await this.walletService.resetDriverWallet(+id);
    return this.responses.success(res, 'Driver wallet reset successfully');
  }

  @Put('schedule')
  @ApiOperation({ summary: 'Update delivery schedule' })
  @Auth()
  async updateSchedule(
    @CurrentUser('id') userId: number,
    @Body() data: DeliveryScheduleDTO,
    @Res() res: Response,
  ) {
    await this.deliveryService.updateSchedule(userId, data);
    return this.responses.success(
      res,
      'Delivery schedule updated successfully',
    );
  }

  @Put('location')
  @ApiOperation({ summary: 'Update delivery current location' })
  @Auth()
  async updateLocation(
    @CurrentUser('id') userId: number,
    @Body() body: UpdateDeliveryLocationDTO,
  ) {
    return this.deliveryService.updateLocation(
      userId,
      body.lat,
      body.lng,
      body.bearing,
    );
  }

  @Get('me/statistics')
  @ApiOperation({ summary: 'Get delivery statistics' })
  @Auth()
  async getStatistics(
    @CurrentUser('id') userId: number,
    @Query() query: GetDeliveryStatisticsDTO,
    @Res() res: Response,
  ) {
    const stats = await this.deliveryService.getStatistics(userId, query);
    return this.responses.success(
      res,
      'Statistics fetched successfully',
      stats,
    );
  }
}
