import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { ResponseService } from 'src/globals/services/response.service';
import { HomeService } from './home.service';

const prefix = 'home';

@Controller(prefix)
@ApiTags('Home')
export class HomeController {
  constructor(
    private readonly service: HomeService,
    private readonly response: ResponseService,
  ) {}

  @Get('/')
  @Auth({ prefix, visitor: true })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  async getHome(
    @Res() res: Response,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const data = await this.service.getHome(
      lat ? +lat : undefined,
      lng ? +lng : undefined,
    );
    return this.response.success(res, 'Home fetched successfully', data);
  }
}
