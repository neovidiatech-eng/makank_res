import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrderModule } from '../../order/order.module';
import { KashierController } from './kashier.controller';
import { KashierService } from './kashier.service';

@Module({
  imports: [ConfigModule, forwardRef(() => OrderModule)],
  providers: [KashierService],
  controllers: [KashierController],
  exports: [KashierService],
})
export class KashierModule {}
