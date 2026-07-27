import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { AttachUserId } from 'src/decorators/api/attachUserIdInterceptor.decorator';
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
import { AddressService } from './address.service';
import {
  CreateAddressDTO,
  FilterAddressDTO,
  UpdateAddressDTO,
} from './dto/address.dto';
import { AddressInterceptor } from './interceptors/address.interceptor';
import { selectAddressOBJ } from './prisma-args/address.prisma.args';

const prefix = 'addresses';

@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
@UseInterceptors(AddressInterceptor)
export class AddressController {
  constructor(
    private readonly service: AddressService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @AttachUserId()
  async create(
    @Res() res: Response,
    @Body() body: CreateAddressDTO,
    @CurrentUser('id') userId: Id,
  ) {
    await this.service.create(body);
    return this.response.created(res, 'address created successfully');
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateAddressDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'address updated successfully');
  }
  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Addresses',
        paginated: true,
        body: [selectAddressOBJ()],
      },
      {
        title: 'Single Address',
        paginated: false,
        body: selectAddressOBJ(),
      },
    ]),
  )
  @ApiOptionalIdParam()
  @ApiQuery({ type: PartialType(FilterAddressDTO) })
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterAddressDTO }) filters: FilterAddressDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'address fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete address successfully');
  }
}
