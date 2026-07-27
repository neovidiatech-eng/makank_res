import { Module } from '@nestjs/common';
import { KeyValueController } from './keyValue.controller';
import { KeyValueService } from './keyValue.service';

@Module({
  controllers: [KeyValueController],
  providers: [KeyValueService],
})
export class KeyValueModule {}
