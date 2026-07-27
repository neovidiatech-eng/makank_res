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
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { ParseJsonBody } from 'src/globals/interceptors/parse-json-body.interceptor';
import { CampaignService } from './campaign.service';
import {
  CreateCampaignDTO,
  FilterCampaignDTO,
  UpdateCampaignDTO,
  UpdateCampaignStatusDTO,
} from './dto/campaign.dto';
import { selectCampaignOBJ } from './prisma-args/campaign.prisma.args';

const prefix = 'campaigns';

@Controller(prefix)
@ApiTags(tag(prefix))
export class CampaignController {
  constructor(
    private readonly service: CampaignService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @UploadFile('image', 'campaigns', ParseJsonBody(['targetUserIds']))
  async create(@Res() res: Response, @Body() body: CreateCampaignDTO) {
    const { dispatch } = await this.service.create(body);
    // For NOTIFICATION campaigns, report how many customers were reached.
    return this.response.created(
      res,
      'Campaign created successfully',
      dispatch ? { dispatch } : undefined,
    );
  }

  @Get(['/', '/:id'])
  @Auth({ prefix })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Campaigns',
        paginated: true,
        body: [selectCampaignOBJ()],
      },
      {
        title: 'Single Campaign',
        paginated: false,
        body: selectCampaignOBJ(),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterCampaignDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterCampaignDTO }) filters: FilterCampaignDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'Campaigns fetched successfully', data, {
      total,
    });
  }

  @Patch('/:id/status')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async updateStatus(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateCampaignStatusDTO,
  ) {
    await this.service.updateStatus(id, body);
    return this.response.success(res, 'Campaign status updated successfully');
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  @UploadFile('image', 'campaigns', ParseJsonBody(['targetUserIds']))
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateCampaignDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'Campaign updated successfully');
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'Campaign deleted successfully');
  }
}
