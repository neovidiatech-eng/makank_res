import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { LanguagesService } from '../languages/languages.service';
import { ServiceModuleController } from './controllers/serviceModule.controller';
import { ServiceModuleFavouriteController } from './controllers/serviceModule.favourite.controller';
import { ServiceModuleFavouriteService } from './services/serviceModule.favourite.service';
import { ServiceModuleHelper } from './services/serviceModule.helper.service';
import { ServiceModuleService } from './services/storeModule.service';

@Module({
  imports: [LogsModule],
  controllers: [ServiceModuleFavouriteController, ServiceModuleController],
  providers: [
    ServiceModuleService,
    ServiceModuleFavouriteService,
    LanguagesService,
    ServiceModuleHelper,
  ],
  exports: [ServiceModuleService, ServiceModuleHelper],
})
export class ServiceModule {}
