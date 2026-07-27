import { Module } from '@nestjs/common';
import { NotificationService } from 'src/globals/services/notification.service';
import { LanguagesService } from '../languages/languages.service';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { CustomerCampaignController } from './controllers/customer-campaign.controller';
import { CampaignDispatchService } from './services/campaign-dispatch.service';

@Module({
  imports: [],
  // CustomerCampaignController is registered first so its static `/active-offers`
  // route is matched before the admin controller's `/:id` param route.
  controllers: [CustomerCampaignController, CampaignController],
  providers: [
    CampaignService,
    CampaignDispatchService,
    NotificationService,
    LanguagesService,
  ],
})
export class CampaignModule {}
