import { Module } from '@nestjs/common';
import { LanguagesService } from '../languages/languages.service';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { HelpersService } from './helpers/employee.helper.service';

@Module({
  imports: [],
  controllers: [EmployeeController],
  providers: [EmployeeService, HelpersService, LanguagesService],
})
export class EmployeeModule {}
