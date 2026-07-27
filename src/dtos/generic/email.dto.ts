import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class EmailDTO {
  @ApiProperty({ example: 'mohamed22kamel.test@gmail.com' })
  @IsEmail()
  email: string;
}
