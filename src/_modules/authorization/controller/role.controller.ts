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
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { OptionalIdParam, RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { Auth } from '../../authentication/decorators/auth.decorator';
import { CreateRoleDTO, UpdateRoleDTO } from '../dto/role.dto';
import {
  selectAllRolesOBJ,
  selectRoleOBJ,
} from '../prisma-args/role.prisma-select';
import { RoleService } from '../services/roles.service';

const prefix = 'roles';
@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class RoleController {
  constructor(
    private readonly service: RoleService,
    private readonly responses: ResponseService,
  ) {}
  @Get(['/all', '/all/:id'])
  @ApiOptionalIdParam()
  async getAllRoles(@Res() res: Response, @Param() { id }: OptionalIdParam) {
    const roles = await this.service.getAllRoles(id);
    return this.responses.success(res, 'Roles retrieved successfully', roles);
  }
  @Get(['/', '/:id'])
  @ApiOptionalIdParam()
  @ApiOkResponse(
    buildExamples([
      {
        title: 'All Roles',
        paginated: false,
        body: [selectAllRolesOBJ()],
      },
      {
        title: 'Role with Id',
        paginated: false,
        body: [selectRoleOBJ()],
      },
    ]),
  )
  @ApiOptionalIdParam('id')
  async get(
    @Res() res: Response,
    @Param() { id }: OptionalIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    const roles = await this.service.getRoles(user, id);
    return this.responses.success(res, 'Roles retrieved successfully', roles);
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() dto: UpdateRoleDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.update(id, dto, user);
    return this.responses.success(res, 'Role updated successfully');
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.delete(id, user);
    return this.responses.success(res, 'Role deleted successfully');
  }

  @Post('/')
  async post(
    @Res() res: Response,
    @Body() dto: CreateRoleDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    await this.service.post(dto, user);
    return this.responses.created(res, 'Create role successfully');
  }
}
