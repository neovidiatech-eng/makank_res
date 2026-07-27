import { Module } from '@nestjs/common';
import { FortuneWheelController } from './fortune-wheel.controller';
import { FortuneWheelService } from './fortune-wheel.service';

@Module({
  controllers: [FortuneWheelController],
  providers: [FortuneWheelService],
  exports: [FortuneWheelService],
})
export class FortuneWheelModule {}
