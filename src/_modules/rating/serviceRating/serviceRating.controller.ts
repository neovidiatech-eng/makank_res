import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseService } from 'src/globals/services/response.service';

import { tag } from 'src/globals/helpers/tag.helper';
import { ServiceRatingService } from './serviceRating.service';

const prefix = 'servicerating';

@Controller(prefix)
@ApiTags(tag(prefix))
export class ServiceRatingController {
  constructor(
    private readonly service: ServiceRatingService,
    private readonly response: ResponseService,
  ) {}

  // @Post('/')
  // @Auth({ prefix })
  // async create(@Res() res: Response, @Body() body: CreateServiceRatingDTO) {
  //   await this.service.create(body);
  //   return this.response.created(res, 'ServiceRating created successfully');
  // }

  // @Get(['/', '/:id'])
  // @ApiOkResponse(
  //   buildExamples([
  //     {
  //       title: 'Get All ServiceRatings',
  //       paginated: true,
  //       body: [selectServiceRatingOBJ()],
  //     },
  //     {
  //       title: 'Single ServiceRating',
  //       paginated: false,
  //       body: selectServiceRatingOBJ(),
  //     },
  //   ]),
  // )
  // @Auth({ prefix, visitor: true })
  // @ApiQuery({ type: PartialType(FilterServiceRatingDTO) })
  // @ApiOptionalIdParam('id')
  // async findAll(
  //   @Res() res: Response,
  //   @Filter({ dto: FilterServiceRatingDTO }) filters: FilterServiceRatingDTO,
  // ) {
  //   const data = await this.service.findAll(filters);
  //   const total = isOne(filters?.id)
  //     ? undefined
  //     : await this.service.count(filters);

  //   return this.response.success(res, 'ServiceRating fetched successfully', data, {
  //     total,
  //   });
  // }

  // @Delete('/:id')
  // @ApiRequiredIdParam()
  // @Auth({ prefix })
  // async delete(@Res() res: Response, @Param() { id }: RequiredIdParam,@CurrentUser() user: CurrentUser) {
  //   await this.service.delete(id,user.id);
  //   return this.response.success(res, 'delete ServiceRating successfully');
  // }
}
