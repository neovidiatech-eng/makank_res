import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { ApiRequiredIdParam } from 'src/decorators/api/id-params.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { CampaignService } from '../campaign.service';

const prefix = 'campaigns';

@Controller(prefix)
@ApiTags(tag(prefix))
export class CustomerCampaignController {
  constructor(
    private readonly service: CampaignService,
    private readonly response: ResponseService,
  ) {}

  @Get('/active-offers')
  @Auth()
  async activeOffers(
    @Res() res: Response,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const data = await this.service.getActiveOffers(currentUser);
    return this.response.success(
      res,
      'Active offers fetched successfully',
      data,
    );
  }

  @Post('/:id/viewed')
  @Auth()
  @ApiRequiredIdParam()
  async viewed(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    await this.service.markViewed(id, currentUser);
    return this.response.success(res, 'Offer marked as viewed successfully');
  }
}
