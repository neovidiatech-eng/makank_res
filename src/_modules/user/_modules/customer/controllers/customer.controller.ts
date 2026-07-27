import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { selectUserOBJ } from 'src/_modules/user/prisma-args/user.prisma-select';
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
import { UpdateCustomerDTO } from '../dto/create.customer.dto';
import { FilterCustomerDTO } from '../dto/filter.customer.dto';
import { CustomerService } from '../services/customer.service';

const prefix = 'customers';
@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class CustomerController {
  constructor(
    private responses: ResponseService,
    private readonly service: CustomerService,
  ) {}

  @Get(['/', '/:id'])
  @ApiQuery({ type: FilterCustomerDTO })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Customer',
        paginated: true,
        body: [{ ...selectUserOBJ(), totalOrders: 0, totalSpent: 0 }],
      },
      {
        title: 'Get Customer with id',
        paginated: false,
        body: { ...selectUserOBJ(), totalOrders: 0, totalSpent: 0 },
      },
    ]),
  )
  @ApiOptionalIdParam()
  async getAll(
    @Res() res: Response,
    @Filter({ dto: FilterCustomerDTO }) filters: FilterCustomerDTO,
  ) {
    const users = await this.service.getAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.responses.success(
      res,
      'Customers returned successfully',
      users,
      {
        total,
      },
    );
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async updateUser(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() dto: UpdateCustomerDTO,
  ) {
    await this.service.update(id, dto);
    return this.responses.success(res, 'Customer updated successfully');
  }

  @Delete('/:id')
  @ApiParam({ name: 'id', required: true, type: Number })
  async deleteUser(@Res() res: Response, @Param('id') id: Id) {
    await this.service.delete(+id);
    return this.responses.success(res, 'Customer deleted successfully');
  }
}
