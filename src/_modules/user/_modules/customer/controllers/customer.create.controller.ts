import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OTPType, SessionType } from '@prisma/client';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { IpAddress } from 'src/_modules/authentication/decorators/ip.decorator';
import { TokenService } from 'src/_modules/authentication/services/jwt.service';
import { OTPService } from 'src/_modules/authentication/services/otp.service';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { CreateCustomerDTO } from '../dto/create.customer.dto';
import { CustomerCreateService } from '../services/customer.create.service';

const prefix = 'customers';
@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ visitor: true, prefix: 'customers/create' })
export class CustomerCreateController {
  constructor(
    private readonly service: CustomerCreateService,
    private readonly OTPService: OTPService,
    private responses: ResponseService,
    private readonly tokenService: TokenService,
  ) {}
  @Post('/')
  @ApiOperation({
    description: 'Create a new customer with permission or register customer',
  })
  async createUser(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: CreateCustomerDTO,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const user = await this.service.create(dto);
    await this.OTPService.generateOTP(user.id, OTPType.EMAIL_VERIFICATION);
    const token = !currentUser
      ? await this.tokenService.generateToken(
          user.id,
          ip,
          undefined,
          SessionType.VERIFY,
        )
      : undefined;
    return this.responses.success(res, 'customer created successfully', {
      user,
      token,
    });
  }
}
