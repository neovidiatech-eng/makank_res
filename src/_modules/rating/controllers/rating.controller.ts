import { Controller, Get, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { ApiOptionalIdParam } from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import { ResponseService } from 'src/globals/services/response.service';
import { FilterRatingDTO } from '../dto/rating.dto';
import { RatingService } from '../services/rating.service';

@ApiTags('Rating')
@Controller('rating')
@Auth({ prefix: 'rating' })
export class RatingController {
  constructor(
    private readonly ratingService: RatingService,
    private readonly response: ResponseService,
  ) {}

  @Get(['/', '/:id'])
  @ApiOptionalIdParam('id')
  @ApiQuery({ type: PartialType(FilterRatingDTO) })
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterRatingDTO }) filters: FilterRatingDTO,
  ) {
    const data = await this.ratingService.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.ratingService.count(filters);

    return this.response.success(res, 'Rating fetched successfully', data, {
      total,
    });
  }
}
