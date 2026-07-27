import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { ResponseService } from 'src/globals/services/response.service';
import { ParseJsonBody } from 'src/globals/interceptors/parse-json-body.interceptor';
import { CreateAdminNotificationDto } from '../dto/create-admin-notification.dto';
import { AdminNotificationService } from '../services/admin-notification.service';

const prefix = 'admin-notifications';

@ApiTags('Admin Notifications')
@Controller(prefix)
export class AdminNotificationController {
  constructor(
    private readonly adminNotificationService: AdminNotificationService,
    private readonly response: ResponseService,
  ) {}

  @Post()
  @Auth({ prefix })
  @UploadFile('image', 'admin-notifications', ParseJsonBody(['targetUserIds']))
  @ApiOperation({ summary: 'Create and send a manual notification' })
  async create(
    @Res() res: Response,
    @Body() createAdminNotificationDto: CreateAdminNotificationDto,
  ) {
    const data = await this.adminNotificationService.createAndSend(
      createAdminNotificationDto,
    );
    return this.response.created(
      res,
      'Notification sent and recorded successfully',
      data,
    );
  }

  @Get()
  @Auth({ prefix })
  @ApiOperation({ summary: 'Get all manual notification history' })
  async findAll(@Res() res: Response) {
    const data = await this.adminNotificationService.findAll();
    return this.response.success(
      res,
      'Notification history fetched successfully',
      data,
    );
  }

  @Get(':id')
  @Auth({ prefix })
  @ApiOperation({ summary: 'Get a specific manual notification history' })
  async findOne(@Res() res: Response, @Param('id', ParseIntPipe) id: number) {
    const data = await this.adminNotificationService.findOne(id);
    return this.response.success(
      res,
      'Notification history detail fetched successfully',
      data,
    );
  }

  @Delete(':id')
  @Auth({ prefix })
  @ApiOperation({ summary: 'Delete a manual notification from history' })
  async remove(@Res() res: Response, @Param('id', ParseIntPipe) id: number) {
    await this.adminNotificationService.remove(id);
    return this.response.success(
      res,
      'Notification history deleted successfully',
    );
  }
}
