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
  @ApiQuery({ name: 'cityId', required: false, type: Number })
  async getHome(
    @Res() res: Response,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('cityId') cityId?: string,
  ) {
    const parsedCityId = cityId ? parseInt(cityId, 10) : undefined;
    const validCityId = parsedCityId && !isNaN(parsedCityId) && parsedCityId > 0 ? parsedCityId : undefined;
    const parsedLat = lat ? parseFloat(lat) : undefined;
    const parsedLng = lng ? parseFloat(lng) : undefined;
    const validLat = parsedLat != null && !isNaN(parsedLat) ? parsedLat : undefined;
    const validLng = parsedLng != null && !isNaN(parsedLng) ? parsedLng : undefined;

    const data = await this.service.getHome(validLat, validLng, validCityId);
    return this.response.success(res, 'Home fetched successfully', data);
  }
}
