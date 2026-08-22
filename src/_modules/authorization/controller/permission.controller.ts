import { Body, Controller, Get, Param, Patch, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { UpdatePermissionDTO } from '../dto/permission.dto';
import { selectPermissionsOBJ } from '../prisma-args/permissions.prisma-select';
import { PermissionService } from '../services/permissions.service';

const prefix = 'permissions';
@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class PermissionController {
  constructor(
    private readonly service: PermissionService,
    private readonly responses: ResponseService,
  ) {}
  @Get('/system')
  @Auth({ prefix })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'All Permissions',
        paginated: false,
        body: [selectPermissionsOBJ()],
      },
    ]),
  )
  async getSystemPermissions(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
  ) {
    const permissions = await this.service.getSystemPermissions(user);
    return this.responses.success(
      res,
      'Permissions retrieved successfully',
      permissions,
      { total: permissions?.length },
    );
  }
  @Get('/')
  @ApiOkResponse(
    buildExamples([
      {
        title: 'All Permissions',
        paginated: false,
        body: [selectPermissionsOBJ()],
      },
    ]),
  )
  async getPermissions(@Res() res: Response, @CurrentUser() user: CurrentUser) {
    const permissions = await this.service.get(user);
    return this.responses.success(
      res,
      'Permissions retrieved successfully',
      permissions,
    );
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async updatePermission(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() dto: UpdatePermissionDTO,
  ) {
    await this.service.update(id, dto);
    return this.responses.success(res, 'Permission updated successfully');
  }
}
