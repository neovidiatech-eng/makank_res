import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DeliveryPromoScope } from '@prisma/client';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CreateDeliveryPromotionDto } from './dto/create-delivery-promotion.dto';
import { UpdateDeliveryPromotionDto } from './dto/update-delivery-promotion.dto';
import { DeliveryPromotionService } from './delivery-promotion.service';

const prefix = 'delivery-promotions';

@Controller(prefix)
export class DeliveryPromotionController {
  constructor(private readonly service: DeliveryPromotionService) {}

  @Post()
  @Auth({ prefix })
  create(@Body() dto: CreateDeliveryPromotionDto) {
    return this.service.create(dto);
  }

  @Get()
  @Auth({ prefix })
  findAll(
    @Query('isActive') isActive?: string,
    @Query('scope') scope?: DeliveryPromoScope,
  ) {
    return this.service.findAll({
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      ...(scope ? { scope } : {}),
    });
  }

  @Get(':id')
  @Auth({ prefix })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Auth({ prefix })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryPromotionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle')
  @Auth({ prefix })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggle(id);
  }

  @Delete(':id')
  @Auth({ prefix })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
