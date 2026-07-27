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
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
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
import { ComplaintService } from './complaint.service';
import {
  CreateComplaintDTO,
  CreateComplaintReplyDTO,
  FilterComplaintDTO,
  UpdateComplaintStatusDTO,
} from './dto/complaint.dto';
import { selectComplaintOBJ } from './prisma-args/complaint.prisma.args';

const prefix = 'complaint';

@Controller(prefix)
@ApiTags(tag(prefix))
export class ComplaintController {
  constructor(
    private readonly service: ComplaintService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  async create(
    @Res() res: Response,
    @Body() body: CreateComplaintDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    body.userId = user.id;
    await this.service.create(body);
    return this.response.created(res, 'Complaint submitted successfully');
  }

  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Complaints',
        paginated: true,
        body: [selectComplaintOBJ()],
      },
      {
        title: 'Single Complaint',
        paginated: false,
        body: selectComplaintOBJ(),
      },
    ]),
  )
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterComplaintDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterComplaintDTO }) filters: FilterComplaintDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    // If user is not admin, they can only see their own complaints.
    // roleKey is stored as RolesKeys.CUSTOMER ('Customer'); the previous lowercase
    // 'customer' never matched, so customers could see every user's complaints.
    if (user.Role.roleKey === RolesKeys.CUSTOMER) {
      filters.userId = user.id;
    }

    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'Complaints fetched successfully', data, {
      total,
    });
  }

  @Patch('/:id/status')
  @ApiRequiredIdParam()
  @Auth({ prefix }) // Admin only should be handled by permission system
  async updateStatus(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateComplaintStatusDTO,
  ) {
    await this.service.updateStatus(id, body);
    return this.response.success(res, 'Complaint status updated successfully');
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'Complaint deleted successfully');
  }

  @Post('/:id/reply')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async reply(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: CreateComplaintReplyDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    body.userId = user.id;
    await this.service.reply(id, body);
    return this.response.created(res, 'Reply submitted successfully');
  }
}
