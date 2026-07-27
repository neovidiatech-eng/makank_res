import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import {
  UploadFile,
  UploadFiles,
} from 'src/decorators/api/upload-file.decorator';
import { ParseJsonBody } from 'src/globals/interceptors/parse-json-body.interceptor';
import { ResponseService } from 'src/globals/services/response.service';

import { OrderStatus } from '@prisma/client';
import { Response } from 'express';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { AttachUserId } from 'src/decorators/api/attachUserIdInterceptor.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { Auth } from '../../authentication/decorators/auth.decorator';
import { CurrentUser } from '../../authentication/decorators/current-user.decorator';
import { RolesKeys } from '../../authorization/providers/roles';
import {
  CalculateCustomDeliveryOrderDTO,
  CreateCustomDeliveryOrderDTO,
  StationActionDTO,
  UploadStationImagesDTO,
} from '../dto/custom-delivery-order.dto';
import {
  CalculateOnlineDeliveryOrderDTO,
  CreateOnlineDeliveryOrderDTO,
} from '../dto/online-delivery-order.dto';
import { OrderStatusCountFilterDTO } from '../dto/order.countStatus.filter.dto';
import {
  AdminNoteDTO,
  AssignOrderDTO,
  BulkDeleteOrdersDTO,
  CalculateOrderDTO,
  ChangeOrderStatusBodyDTO,
  ChangeOrderStatusParam,
  CreateOrderDTO,
  FilterOrderDTO,
  VerifyOrderPaymentDTO,
} from '../dto/order.dto';
import { PaymentDetailDTO } from '../dto/order.payment.dto';
import { RateDTO } from '../dto/order.rate.dto';
import { ReorderDTO } from '../dto/reorder.dto';
import { OrderService } from '../order.service';

const prefix = 'orders';

@Controller(prefix)
@ApiTags(tag(prefix))
export class OrderController {
  constructor(
    private readonly service: OrderService,
    private readonly response: ResponseService,
  ) {}
  @Post('/')
  @Auth({ prefix })
  @AttachUserId()
  @UploadFile('transferImage', 'orders', ParseJsonBody(['items']))
  async create(@Res() res: Response, @Body() body: CreateOrderDTO) {
    const data = await this.service.create(body);
    return this.response.created(res, 'order created successfully', { data });
  }

  // Admin-only bulk cleanup. Real hard delete (Order has no soft-delete
  // column) — every child row (items, stations, ratings, assignment history)
  // cascades automatically. If an order had already reached DELIVERED, its
  // admin/branch/driver wallet credits are reversed first so deleting test
  // orders doesn't leave phantom earnings behind. Never fully fails: each id
  // is handled independently and failures are reported back per-id.
  @Post('/bulk-delete')
  @Auth({ prefix })
  async bulkDelete(@Res() res: Response, @Body() body: BulkDeleteOrdersDTO) {
    const data = await this.service.bulkDeleteOrders(body.orderIds);
    return this.response.success(res, 'orders deleted', data);
  }

  // Re-submits a past order's items/bundles as a new order — re-priced from
  // scratch, not a copy of the old invoice (menu prices may have changed).
  @Post('/:id/reorder')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async reorder(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: ReorderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.reorder(id, user.id, body);
    return this.response.created(res, 'order created successfully', { data });
  }

  @Patch('/assign')
  @Auth({ prefix })
  async assign(@Res() res: Response, @Body() body: AssignOrderDTO) {
    const data = await this.service.assign(body);
    return this.response.created(res, 'order assigned successfully', { data });
  }

  @Patch('/:id/unassign')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async unassign(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.unassignDelegate(id, user);
    return this.response.success(
      res,
      'Delegate unassigned and order reset to ready for pickup',
    );
  }

  @Patch('/:id/accept')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async acceptAssignment(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser('id') userId: number,
  ) {
    const data = await this.service.acceptOrderAssignment(id, userId);
    return this.response.success(res, 'Assignment accepted successfully', data);
  }

  @Patch('/:id/reject')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async rejectAssignment(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser('id') userId: number,
  ) {
    const data = await this.service.rejectOrderAssignment(id, userId);
    return this.response.success(res, 'Assignment rejected successfully', data);
  }
  @Patch('/:id/admin-note')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async addAdminNote(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: AdminNoteDTO,
  ) {
    const data = await this.service.addAdminNote(id, body.adminNote);
    return this.response.success(res, 'Admin note updated successfully', data);
  }

  @Patch('/:id/verify-payment')
  @ApiRequiredIdParam()
  @Auth({ prefix: 'payment-verification' })
  async verifyPayment(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: VerifyOrderPaymentDTO,
  ) {
    await this.service.verifyPayment(id, body.approved, body.reason);
    return this.response.success(
      res,
      'Payment verification updated successfully',
    );
  }

  @Patch('/:id/:status')
  @ApiRequiredIdParam()
  @ApiParam({
    name: 'status',
    enum: OrderStatus,
    required: true,
  })
  @Auth({ prefix })
  async changeStatus(
    @Res() res: Response,
    @Param() { status, id }: ChangeOrderStatusParam,
    // lat/lng travel in the body — :id/:status are route params, there's no
    // :lat/:lng segment for @Param() to ever bind them from.
    @Body() body: ChangeOrderStatusBodyDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.changeStatus(id, status, user, body?.lat, body?.lng);
    return this.response.created(res, 'order status changed successfully');
  }

  @Get('/archived')
  @Auth({ prefix })
  @AttachUserId()
  @ApiQuery({ type: PartialType(FilterOrderDTO) })
  async findAllArchived(
    @Res() res: Response,
    @Filter({ dto: FilterOrderDTO }) filters: FilterOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.findAllArchived(filters, user);
    const total = await this.service.countArchived(filters, user);
    return this.response.success(
      res,
      'Archived orders fetched successfully',
      data,
      { total },
    );
  }

  @Get('/:id/tracking')
  @ApiRequiredIdParam()
  @Auth({ prefix, visitor: true })
  async getTracking(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    const data = await this.service.getTracking(id);
    return this.response.success(
      res,
      'Order tracking fetched successfully',
      data,
    );
  }

  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @AttachUserId()
  @ApiQuery({ type: PartialType(FilterOrderDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterOrderDTO }) filters: FilterOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    if (user.Role.roleKey === RolesKeys.STORE) {
      filters.branchId = user.branchId;
    }
    const data = await this.service.findAll(filters, user);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'Order fetched successfully', data, {
      total,
    });
  }
  @Post('/calculate/order')
  @Auth({ prefix })
  async calculateOrder(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Body() body: CalculateOrderDTO,
  ) {
    const data = await this.service.calculateOrder({
      ...body,
      userId: user.id,
    });

    return this.response.success(
      res,
      'Order calculation fetched successfully',
      data,
    );
  }

  @Get('/statistics/status-count')
  @Auth({ prefix })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(OrderStatusCountFilterDTO) })
  async getOrderStatusCount(
    @Res() res: Response,
    @Filter({ dto: OrderStatusCountFilterDTO })
    filters: OrderStatusCountFilterDTO,
  ) {
    const data = await this.service.getOrderStatusCount(filters);

    return this.response.success(
      res,
      'Order Status Counts fetched successfully',
      data,
    );
  }

  @Post('/:id/payment')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async paymentOrder(
    @Res() res: Response,
    @Body() body: PaymentDetailDTO,
    @Param() { id }: RequiredIdParam,
  ) {
    await this.service.paymentOrder(id, body);
    return this.response.success(res, 'payment_order_successfully');
  }

  @Post('/:id/rate')
  @Auth({})
  @ApiRequiredIdParam()
  @ApiOperation({
    summary: 'Rate the store and/or driver for a delivered order',
    description:
      'Single submission per order. Send `storeRate` and/or `deliveryRate` (1–5) — at ' +
      'least one is required — in one request. The first successful submission sets ' +
      '`order.rated = true` and blocks any further rating. Use the order response ' +
      '`ratingEligibility` flags to build the rating screen. ' +
      'See docs/order-rating-mobile-guide.md.',
  })
  async rateOrder(
    @Res() res: Response,
    @Body() body: RateDTO,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.rateOrder(id, body, user.id);
    return this.response.success(res, 'rate_order_successfully');
  }

  @Post('/custom-delivery/calculate')
  @Auth({ prefix, visitor: true })
  @UseInterceptors(ParseJsonBody(['stops']))
  async calculateCustomDeliveryOrder(
    @Res() res: Response,
    @Body() body: CalculateCustomDeliveryOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.calculateCustomDeliveryOrder({
      ...body,
      userId: user?.id,
    });
    return this.response.success(
      res,
      'Custom delivery order calculated successfully',
      data,
    );
  }

  @Post('/custom-delivery')
  @Auth({ prefix })
  @AttachUserId()
  @UploadFile('transferImage', 'orders', ParseJsonBody(['stops']))
  async createCustomDeliveryOrder(
    @Res() res: Response,
    @Body() body: CreateCustomDeliveryOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.createCustomDeliveryOrder({
      ...body,
      userId: user.id,
    });
    return this.response.created(
      res,
      'Custom delivery order created successfully',
      { data },
    );
  }

  // Customer: upload one or more images for a custom-delivery station before
  // creating the order. Returns the created image ids; the client embeds them
  // under the matching stop's `imageIds` when calling POST /custom-delivery.
  // Owner is taken from @CurrentUser() — do NOT use @AttachUserId() here: it
  // injects `userId` into the body, which the global ValidationPipe
  // (forbidNonWhitelisted) would reject since UploadStationImagesDTO has no such
  // field (and it throws outright for admin callers).
  @Post('/custom-delivery/images')
  @Auth({ prefix })
  @UploadFiles('images', 'orders', 10, 'image/')
  async uploadStationImages(
    @Res() res: Response,
    @Body() body: UploadStationImagesDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const imageIds = await this.service.createStationImageUploads(
      user.id,
      body.images,
    );
    return this.response.created(res, 'images uploaded successfully', {
      imageIds,
    });
  }

  // Driver: complete the active station and move to the next one ("Move to next location").
  @Patch('/custom-delivery/:id/advance')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async advanceCustomDeliveryStation(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: StationActionDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.advanceCustomDeliveryStation(
      id,
      user,
      body.lat,
      body.lng,
    );
    return this.response.success(
      res,
      'Moved to next station successfully',
      data,
    );
  }

  // Driver: finish the whole task on the final station ("Finish Task").
  @Patch('/custom-delivery/:id/finish')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async finishCustomDelivery(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: StationActionDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.finishCustomDelivery(
      id,
      user,
      body.lat,
      body.lng,
    );
    return this.response.success(res, 'Task finished successfully', data);
  }

  // Online-seller delivery — a system fully separate from the purchase/shopping
  // custom-delivery flow above (own DTOs/logic), built on the same Order table.

  // Returns the caller's saved seller profile (name/phone/pickup zone), if any,
  // so the frontend can auto-fill the "طلب جديد +" follow-up order form.
  @Get('/online-delivery/seller-profile')
  @Auth({ prefix })
  async getOnlineSellerProfile(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.getOnlineSellerProfile(user.id);
    return this.response.success(
      res,
      'Seller profile fetched successfully',
      data,
    );
  }

  @Post('/online-delivery/calculate')
  @Auth({ prefix })
  async calculateOnlineDeliveryOrder(
    @Res() res: Response,
    @Body() body: CalculateOnlineDeliveryOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.calculateOnlineDeliveryOrder({
      ...body,
      userId: user.id,
    });
    return this.response.success(
      res,
      'Online delivery order calculated successfully',
      data,
    );
  }

  @Post('/online-delivery')
  @Auth({ prefix })
  @AttachUserId()
  async createOnlineDeliveryOrder(
    @Res() res: Response,
    @Body() body: CreateOnlineDeliveryOrderDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.createOnlineDeliveryOrder({
      ...body,
      userId: user.id,
    });
    return this.response.created(
      res,
      'Online delivery order created successfully',
      { data },
    );
  }

  @Post('/archived/:id/realize')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async realizeArchivedOrder(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
  ) {
    const data = await this.service.realizeArchivedOrder(id);
    return this.response.created(res, 'Archived order realized successfully', {
      data,
    });
  }
}
