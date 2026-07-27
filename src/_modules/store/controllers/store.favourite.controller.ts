import { Controller, Get, Param, Patch, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { FilterStoreDTO } from '../dto/store.dto';
import { selectStoreOBJWithFavourite } from '../prisma-args/store.prisma.args';
import { StoreFavouriteService } from '../services/store.favourite.service';
import { StoreService } from '../services/store.service';

const prefix = 'stores/favourite';

@Controller(prefix)
@ApiTags(tag('Favourite Store'))
@Auth({ prefix })
export class StoreFavouriteController {
  constructor(
    private readonly service: StoreFavouriteService,
    private readonly main: StoreService,
    private readonly response: ResponseService,
  ) {}
  @Patch('/:id')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Param() { id }: RequiredIdParam,
  ) {
    await this.service.update(id, user.id);
    return this.response.created(res, 'favourite store updated successfully');
  }
  @Get(['/', '/:id'])
  @Auth({ prefix, visitor: true })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Stores For Customers',
        paginated: true,
        body: [selectStoreOBJWithFavourite(0)],
      },
      {
        title: 'Single Store For Customers',
        paginated: false,
        body: selectStoreOBJWithFavourite(0),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterStoreDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Filter({ dto: FilterStoreDTO }) filters: FilterStoreDTO,
  ) {
    filters.favouriteCustomerId = user.id;
    const data = await this.main.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.main.count(filters);

    return this.response.success(res, 'store fetched successfully', data, {
      total,
    });
  }
}
