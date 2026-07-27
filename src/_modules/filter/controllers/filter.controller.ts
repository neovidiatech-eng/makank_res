import { Controller, Get, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { FilterSlotsDTO } from '../dto/filter.dto';
import { FilterService } from '../services/filter.service';

const prefix = 'filters';

@Controller(prefix)
@ApiTags(tag(prefix))
export class FilterController {
  constructor(
    private readonly service: FilterService,
    private readonly response: ResponseService,
  ) {}

  @Get('/price-range')
  @Auth({ prefix, visitor: true })
  async priceRange(@Res() res: Response) {
    const data = await this.service.getPriceRange();

    return this.response.success(res, 'range fetched successfully', data);
  }

  @Get('/km-max-range')
  @Auth({ prefix, visitor: true })
  async kmMaxRange(@Res() res: Response) {
    const data = await this.service.getKmMaxRange();

    return this.response.success(res, 'range fetched successfully', data);
  }

  @Get('/slots')
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterSlotsDTO) })
  async findSlots(
    @Res() res: Response,
    @Filter({ dto: FilterSlotsDTO }) filters: FilterSlotsDTO,
  ) {
    const data = await this.service.getPriceSlots(filters);

    return this.response.success(res, 'slots fetched successfully', data);
  }
}
