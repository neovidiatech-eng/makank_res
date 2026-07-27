import {
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseInterceptors,
} from '@nestjs/common';
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
import { FilterServiceDTO } from '../dto/service.dto';
import { AuthServiceInterceptor } from '../interceptors/auth.aervice.interceptor';
import { selectServiceOBJWithFavourite } from '../prisma-args/service.prisma.args';
import { ServiceModuleFavouriteService } from '../services/serviceModule.favourite.service';
import { ServiceModuleService } from '../services/storeModule.service';

const prefix = 'services/favourite';

@Controller(prefix)
@ApiTags(tag('Favourite Service'))
@Auth({ prefix })
export class ServiceModuleFavouriteController {
  constructor(
    private readonly service: ServiceModuleFavouriteService,
    private readonly main: ServiceModuleService,
    private readonly response: ResponseService,
  ) {}
  @Patch('/:id')
  @ApiRequiredIdParam()
  async updateFav(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Param() { id }: RequiredIdParam,
  ) {
    await this.service.update(id, user.id);
    return this.response.created(res, 'favourite service updated successfully');
  }
  @Get(['/'])
  @Auth({ prefix, visitor: true })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Service For Customers',
        paginated: true,
        body: [selectServiceOBJWithFavourite(0)],
      },
      {
        title: 'Single Service For Customers',
        paginated: false,
        body: selectServiceOBJWithFavourite(0),
      },
    ]),
  )
  @UseInterceptors(AuthServiceInterceptor)
  @ApiQuery({ type: PartialType(FilterServiceDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Filter({ dto: FilterServiceDTO }) filters: FilterServiceDTO,
  ) {
    filters.favouriteCustomerId = user.id;
    const data = await this.main.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.main.count(filters);
    return this.response.success(res, 'service fetched successfully', data, {
      total,
    });
  }
}
