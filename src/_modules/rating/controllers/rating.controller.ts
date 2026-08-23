import { Body, Controller, Delete, Get, Param, Patch, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { ApiOptionalIdParam, ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { ResponseService } from 'src/globals/services/response.service';
import { FilterRatingDTO, ReplyRatingDTO } from '../dto/rating.dto';
import { RatingService } from '../services/rating.service';

@ApiTags('Rating')
@Controller(['rating', 'storerating'])
@Auth({ prefix: 'rating' })
export class RatingController {
  constructor(
    private readonly ratingService: RatingService,
    private readonly response: ResponseService,
  ) {}

  @Get(['/', '/:id'])
  @AttachStoreId()
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

  // Store owner (or admin) replies to a customer's store review. Only ever
  // on the store's own reviews — see RatingService.reply for the ownership
  // check.
  @Patch('/:id/reply')
  @ApiRequiredIdParam()
  async reply(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: ReplyRatingDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.ratingService.reply(id, body.reply, user);
    return this.response.success(res, 'Reply submitted successfully');
  }

  // Store (or admin) can remove a review outright — never edit its
  // rating/comment, that's intentionally not exposed anywhere.
  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.ratingService.delete(id, user);
    return this.response.success(res, 'Rating deleted successfully');
  }
}
