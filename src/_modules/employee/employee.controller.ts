import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
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
import { Auth } from '../authentication/decorators/auth.decorator';
import { CurrentUser } from '../authentication/decorators/current-user.decorator';
import {
  CreateEmployeeDTO,
  FilterEmployeeDTO,
  UpdateEmployeeDTO,
} from './dto/employee.dto';
import { EmployeeService } from './employee.service';
import { selectEmployeeOBJ } from './prisma-args/employee.prisma.args';

const prefix = 'employees';

@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class EmployeeController {
  constructor(
    private readonly service: EmployeeService,
    private readonly response: ResponseService,
  ) {}
  @Get(['/', '/:id'])
  @ApiQuery({ type: FilterEmployeeDTO })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Employees',
        paginated: true,
        body: [selectEmployeeOBJ()],
      },
      {
        title: 'Get Employee with id',
        paginated: false,
        body: selectEmployeeOBJ(),
      },
    ]),
  )
  @ApiOptionalIdParam()
  @AttachStoreId()
  async getAll(
    @Res() res: Response,
    @Filter({ dto: FilterEmployeeDTO }) filters: FilterEmployeeDTO,
  ) {
    const Employees = await this.service.getAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.response.success(
      res,
      'Employees returned successfully',
      Employees,
      {
        total,
      },
    );
  }
  @Post('/')
  @AttachStoreId()
  async create(@Res() res: Response, @Body() dto: CreateEmployeeDTO) {
    await this.service.create(dto);
    return this.response.success(res, 'employee created successfully');
  }
  @Patch('/:id')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() dto: UpdateEmployeeDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.update(id, dto, user);
    return this.response.success(res, 'Employee updated successfully');
  }
  @Delete('/:id')
  @ApiRequiredIdParam()
  async deleteUser(
    @Res() res: Response,
    @Param('id') id: Id,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.delete(+id, user);
    return this.response.success(res, 'Employee deleted successfully');
  }
}
