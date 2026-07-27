import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseService } from 'src/globals/services/response.service';

import { tag } from 'src/globals/helpers/tag.helper';
import { StoreRatingService } from './storeRating.service';

const prefix = 'storerating';

@Controller(prefix)
@ApiTags(tag(prefix))
export class StoreRatingController {
  constructor(
    private readonly service: StoreRatingService,
    private readonly response: ResponseService,
  ) {}

  // @Post('/')
  // @Auth({ prefix })
  // async create(@Res() res: Response, @Body() body: CreateStoreRatingDTO) {
  //   await this.service.create(body);
  //   return this.response.created(res, 'StoreRating created successfully');
  // }

  // @Get(['/', '/:id'])
  // @ApiOkResponse(
  //   buildExamples([
  //     {
  //       title: 'Get All StoreRatings',
  //       paginated: true,
  //       body: [selectStoreRatingOBJ()],
  //     },
  //     {
  //       title: 'Single StoreRating',
  //       paginated: false,
  //       body: selectStoreRatingOBJ(),
  //     },
  //   ]),
  // )
  // @Auth({ prefix, visitor: true })
  // @ApiQuery({ type: PartialType(FilterStoreRatingDTO) })
  // @ApiOptionalIdParam('id')
  // async findAll(
  //   @Res() res: Response,
  //   @Filter({ dto: FilterStoreRatingDTO }) filters: FilterStoreRatingDTO,
  // ) {
  //   const data = await this.service.findAll(filters);
  //   const total = isOne(filters?.id)
  //     ? undefined
  //     : await this.service.count(filters);

  //   return this.response.success(res, 'StoreRating fetched successfully', data, {
  //     total,
  //   });
  // }

  // @Delete('/:id')
  // @ApiRequiredIdParam()
  // @Auth({ prefix })
  // async delete(@Res() res: Response, @Param() { id }: RequiredIdParam,@CurrentUser() user: CurrentUser) {
  //   await this.service.delete(id,user.id);
  //   return this.response.success(res, 'delete StoreRating successfully');
  // }
}
