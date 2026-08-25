import { Controller, Get, Patch, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Request, Response } from 'express';
import { ApiFilter } from 'src/decorators/api/filter.decorator';
import { UploadNestedFiles } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { Auth } from '../authentication/decorators/auth.decorator';
import { SettingFilter, UpdateSettingDTO } from './dto/setting';
import { SettingsService } from './settings.service';

const prefix = 'settings';
@Controller(prefix)
@ApiTags(tag(prefix))
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly responses: ResponseService,
  ) {}

  @Get('/app-status')
  async getAppStatus(@Res() res: Response) {
    const data = await this.settingsService.getAppStatus();
    return this.responses.success(
      res,
      'App status retrieved successfully',
      data,
    );
  }

  @Patch('/app-status')
  @Auth({ prefix })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isMaintenance: { type: 'boolean', example: true },
        isOpen: { type: 'boolean', example: false },
        messageAr: {
          type: 'string',
          example: 'التطبيق مغلق حالياً لأعمال الصيانة والتحديث، سنعود قريباً!',
        },
        messageEn: {
          type: 'string',
          example: 'The app is currently under maintenance, we will be back soon!',
        },
      },
    },
  })
  async updateAppStatus(@Res() res: Response, @Req() req: Request) {
    const data = await this.settingsService.updateAppStatus(req.body);
    return this.responses.success(
      res,
      'App status updated successfully',
      data,
    );
  }

  @Get(['/'])
  @ApiFilter(SettingFilter)
  async get(
    @Res() res: Response,
    @Filter({ dto: SettingFilter }) filters: SettingFilter,
  ) {
    const data = await this.settingsService.get(filters);
    return this.responses.success(res, 'get settings successfully', data);
  }

  @Patch('/')
  @UploadNestedFiles('settings', 'file', 10, 'settings', {
    fileTypePrefix: 'image/',
    // maxSize: 10 * 1024 * 1024,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        settings: {
          type: 'string', // JSON stringified array of AnswerQestionDTO
          example: JSON.stringify([
            {
              setting: 'test answer',
              value: 'test answer',
              name: {},
            },
          ]),
        },

        'settings[0].file': {
          type: 'string',
          format: 'binary',
        },
        'settings[1].file': {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Auth({ prefix })
  async update(
    @Res() res: Response,

    @Req() req: Request,
  ) {
    const body = plainToInstance(UpdateSettingDTO, req.body);
    if (body?.settings?.length) {
      body.settings = body.settings.map((item, index) => {
        console.log(index);
        const fileFromReq = req?.body?.settings[index]?.file;
        const value = fileFromReq ? fileFromReq : item.value;
        return {
          setting: item.setting,
          value: value,
          name: item.name,
        };
      });
    }
    await this.settingsService.update(body);
    return this.responses.success(res, 'update settings successfully');
  }
}
