import { ForbiddenException } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { StoreController } from '../controllers/store.controller';
import { StoreService } from '../services/store.service';

describe('Store Zone Pricing - Admin Dashboard Only Enforcement Tests', () => {
  let controller: StoreController;
  let mockService: Partial<StoreService>;
  let mockResponseService: any;
  let mockRes: any;

  beforeEach(() => {
    mockService = {
      toggleZonePricing: jest.fn().mockResolvedValue(undefined),
      setZonePrices: jest.fn().mockResolvedValue({ zones: [] } as any),
      deleteZonePrice: jest.fn().mockResolvedValue({ zones: [] } as any),
    };

    mockResponseService = {
      success: jest.fn((res, msg, data) => ({ success: true, message: msg, data })),
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    controller = new StoreController(
      mockService as StoreService,
      {} as any,
      {} as any,
      mockResponseService,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('StoreController - toggleZonePricing', () => {
    it('REJECTS store owner/worker with ForbiddenException', async () => {
      const storeUser: any = { id: 1, storeId: 10, Role: { roleKey: RolesKeys.STORE } };

      await expect(
        controller.toggleZonePricing(mockRes, { id: 10 }, { enabled: true }, storeUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockService.toggleZonePricing).not.toHaveBeenCalled();
    });

    it('REJECTS customer user with ForbiddenException', async () => {
      const customerUser: any = { id: 2, Role: { roleKey: RolesKeys.CUSTOMER } };

      await expect(
        controller.toggleZonePricing(mockRes, { id: 10 }, { enabled: true }, customerUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockService.toggleZonePricing).not.toHaveBeenCalled();
    });

    it('ALLOWS dashboard admin to toggle store zone pricing', async () => {
      const adminUser: any = { id: 99, Role: { roleKey: RolesKeys.ADMIN, default: true } };

      await controller.toggleZonePricing(mockRes, { id: 10 }, { enabled: true }, adminUser);

      expect(mockService.toggleZonePricing).toHaveBeenCalledWith(10, true, adminUser);
      expect(mockResponseService.success).toHaveBeenCalledWith(
        mockRes,
        'store zone pricing toggled successfully',
      );
    });
  });

  describe('StoreController - setZonePrices', () => {
    it('REJECTS store user with ForbiddenException', async () => {
      const storeUser: any = { id: 1, storeId: 10, Role: { roleKey: RolesKeys.STORE } };

      await expect(
        controller.setZonePrices(mockRes, '10', { zonePrices: [{ zoneId: 1, price: 25 }] }, storeUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockService.setZonePrices).not.toHaveBeenCalled();
    });

    it('ALLOWS dashboard admin to update zone prices', async () => {
      const adminUser: any = { id: 99, Role: { roleKey: RolesKeys.ADMIN } };
      const payload = { zonePrices: [{ zoneId: 1, price: 25 }] };

      await controller.setZonePrices(mockRes, '10', payload, adminUser);

      expect(mockService.setZonePrices).toHaveBeenCalledWith('10', payload, adminUser);
      expect(mockResponseService.success).toHaveBeenCalledWith(
        mockRes,
        'store zone prices updated successfully',
        { zones: [] },
      );
    });
  });

  describe('StoreController - deleteZonePrice', () => {
    it('REJECTS store user with ForbiddenException', async () => {
      const storeUser: any = { id: 1, storeId: 10, Role: { roleKey: RolesKeys.STORE } };

      await expect(
        controller.deleteZonePrice(mockRes, '10', 1, storeUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockService.deleteZonePrice).not.toHaveBeenCalled();
    });

    it('ALLOWS dashboard admin to delete a zone price override', async () => {
      const adminUser: any = { id: 99, Role: { roleKey: RolesKeys.ADMIN } };

      await controller.deleteZonePrice(mockRes, '10', 1, adminUser);

      expect(mockService.deleteZonePrice).toHaveBeenCalledWith('10', 1, adminUser);
      expect(mockResponseService.success).toHaveBeenCalledWith(
        mockRes,
        'store zone price removed successfully',
        { zones: [] },
      );
    });
  });
});
