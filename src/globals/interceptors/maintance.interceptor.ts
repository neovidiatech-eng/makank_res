import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrivateSettingService } from '../services/settings.service';

@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  constructor(private readonly settingsService: PrivateSettingService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    return next.handle();
  }
}
