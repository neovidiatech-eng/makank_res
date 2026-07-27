import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { EmailService } from 'src/globals/services/email.service';
import { ResponseService } from 'src/globals/services/response.service';
import { AppService } from './app.service';
@Controller()
export class AppController {
  constructor(
    private readonly response: ResponseService,
    private readonly service: AppService,
    private readonly emailService: EmailService,
  ) {}

  @Get('/debug-sentry')
  async getError() {
    await this.emailService.sendEmail('fhakem75@gmail.com', 'test', 'test');
    return 'g';
  }
  @Get('/roles-show')
  @ApiOperation({ deprecated: true })
  async rolesShow(@Res() res: Response) {
    const data = await this.service.getAllRoles();
    return this.response.success(res, 'Roles returned successfully', data);
  }
}
