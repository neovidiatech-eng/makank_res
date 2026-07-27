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
import {
  CreateFortuneWheelItemDTO,
  FilterFortuneWheelItemDTO,
  FilterUserRewardDTO,
  UpdateFortuneWheelItemDTO,
  UpdateFortuneWheelSettingsDTO,
} from './dto/fortune-wheel.dto';
import { FortuneWheelService } from './fortune-wheel.service';
import { selectFortuneWheelItemOBJ } from './prisma-args/fortune-wheel.prisma.args';

const prefix = 'fortune-wheel';

@Controller(prefix)
@ApiTags(tag(prefix))
export class FortuneWheelController {
  constructor(
    private readonly service: FortuneWheelService,
    private readonly response: ResponseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Admin: global settings
  // ---------------------------------------------------------------------------

  @Get('/settings')
  @Auth({ prefix })
  async getSettings(@Res() res: Response) {
    const data = await this.service.getSettings();
    return this.response.success(
      res,
      'Fortune wheel settings fetched successfully',
      data,
    );
  }

  @Patch('/settings')
  @Auth({ prefix })
  async updateSettings(
    @Res() res: Response,
    @Body() body: UpdateFortuneWheelSettingsDTO,
  ) {
    const data = await this.service.updateSettings(body);
    return this.response.success(
      res,
      'Fortune wheel settings updated successfully',
      data,
    );
  }

  // ---------------------------------------------------------------------------
  // Customer: display eligibility (backend is the source of truth)
  // ---------------------------------------------------------------------------

  @Get('/eligibility')
  @Auth()
  async eligibility(@Res() res: Response, @CurrentUser('id') userId: Id) {
    const data = await this.service.getEligibility(userId);
    return this.response.success(
      res,
      'Fortune wheel eligibility fetched successfully',
      data,
    );
  }

  @Post('/mark-shown')
  @Auth()
  async markShown(@Res() res: Response, @CurrentUser('id') userId: Id) {
    const data = await this.service.markShown(userId);
    return this.response.success(
      res,
      'Fortune wheel marked as shown successfully',
      data,
    );
  }

  @Post('/spin')
  @Auth()
  async spin(@Res() res: Response, @CurrentUser('id') userId: Id) {
    const data = await this.service.spin(userId);
    return this.response.success(res, 'Fortune wheel spun successfully', data);
  }

  @Get('/my-rewards')
  @Auth()
  @ApiQuery({ type: PartialType(FilterUserRewardDTO) })
  async myRewards(
    @Res() res: Response,
    @CurrentUser('id') userId: Id,
    @Filter({ dto: FilterUserRewardDTO }) filters: FilterUserRewardDTO,
  ) {
    const { data, total } = await this.service.listMyRewards(userId, filters);
    return this.response.success(
      res,
      'Fortune wheel rewards fetched successfully',
      data,
      { total },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin: reward item CRUD
  // ---------------------------------------------------------------------------

  @Post('/')
  @Auth({ prefix })
  async create(@Res() res: Response, @Body() body: CreateFortuneWheelItemDTO) {
    await this.service.create(body);
    return this.response.created(
      res,
      'Fortune wheel item created successfully',
    );
  }

  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Fortune Wheel Items',
        paginated: true,
        body: [selectFortuneWheelItemOBJ()],
      },
      {
        title: 'Single Fortune Wheel Item',
        paginated: false,
        body: selectFortuneWheelItemOBJ(),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterFortuneWheelItemDTO) })
  @ApiOptionalIdParam('id')
  @Auth({ prefix })
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterFortuneWheelItemDTO })
    filters: FilterFortuneWheelItemDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(
      res,
      'Fortune wheel items fetched successfully',
      data,
      { total },
    );
  }

  @Patch('/:id/toggle-status')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async toggleStatus(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.toggleStatus(id);
    return this.response.success(
      res,
      'Fortune wheel item status toggled successfully',
    );
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateFortuneWheelItemDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(
      res,
      'Fortune wheel item updated successfully',
    );
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(
      res,
      'Fortune wheel item deleted successfully',
    );
  }
}
