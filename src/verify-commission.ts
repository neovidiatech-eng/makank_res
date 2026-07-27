import { Test, TestingModule } from '@nestjs/testing';
import { HelpersService } from './_modules/order/services/helpers.service';
import { GlobalHelpers } from './globals/services/globalHelpers.service';
import { MapService } from './globals/services/map.service';
import { PrismaService } from './globals/services/prisma.service';
import { PrivateSettingService } from './globals/services/settings.service';

async function test() {
  const mockPrisma = {
    address: { findUnique: jest.fn() },
    branch: { findUnique: jest.fn() },
    settings: { findUnique: jest.fn() },
  };

  const mockSettingsService = {
    getSettings: jest.fn().mockResolvedValue({
      shippingKMCharge: { value: '10' },
      deliveryCommission: { value: '5' },
    }),
  };

  const mockMapService = {
    getBatchDetails: jest.fn().mockResolvedValue([{ distance: 10 }]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HelpersService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: PrivateSettingService, useValue: mockSettingsService },
      { provide: MapService, useValue: mockMapService },
      { provide: GlobalHelpers, useValue: {} },
    ],
  }).compile();

  const service = module.get<HelpersService>(HelpersService);

  // Test Standard Delivery Price: 10km * 10 + 5 = 105
  mockPrisma.address.findUnique.mockResolvedValue({ lat: 0, lng: 0 });
  mockPrisma.branch.findUnique.mockResolvedValue({ lat: 0, lng: 0.1 });
  mockPrisma.settings.findUnique.mockResolvedValue(null); // No free delivery

  const price = await service.getDeliveryPrice(1, 1, 100);
  console.log(`Standard Delivery Price (Expected 105): ${price}`);

  // Test Custom Delivery Price: 10km * 10 + 5 = 105
  const customPrice = await service.getCustomDeliveryPrice([
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.1 },
  ]);
  console.log(`Custom Delivery Price (Expected 105): ${customPrice}`);
}

// This is a conceptual script; in a real environment, I'd run this with ts-node or jest.
