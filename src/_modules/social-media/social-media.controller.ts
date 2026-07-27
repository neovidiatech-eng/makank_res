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
import { CurrentUser } from '../authentication/decorators/current-user.decorator';
import {
  CreateSocialMediaDTO,
  FilterSocialMediaDTO,
  UpdateSocialMediaDTO,
} from './dto/social-media.dto';
import { selectSocialMediaOBJ } from './prisma-args/social-media.prisma.args';
import { SocialMediaService } from './social-media.service';

const prefix = 'social-media';

@Controller(prefix)
@ApiTags(tag('Social Media'))
export class SocialMediaController {
  constructor(
    private readonly service: SocialMediaService,
    private readonly response: ResponseService,
  ) {}
  @Auth({ prefix })
  @Post('/')
  @UploadFile('image', 'socialMedia')
  async create(@Res() res: Response, @Body() body: CreateSocialMediaDTO) {
    await this.service.create(body);
    return this.response.created(res, 'SocialMedia created successfully');
  }
  @Auth({ prefix })
  @Patch('/:id')
  @ApiRequiredIdParam()
  @UploadFile('image', 'socialMedia')
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateSocialMediaDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'SocialMedia updated successfully');
  }
  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All SocialMedias',
        paginated: true,
        body: [selectSocialMediaOBJ()],
      },
      {
        title: 'Single SocialMedia',
        paginated: false,
        body: selectSocialMediaOBJ(),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterSocialMediaDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterSocialMediaDTO }) filters: FilterSocialMediaDTO,
    @CurrentUser() user: CurrentUser,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(
      res,
      'SocialMedia fetched successfully',
      data,
      { total },
    );
  }
  @Auth({ prefix })
  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete SocialMedia successfully');
  }
}
