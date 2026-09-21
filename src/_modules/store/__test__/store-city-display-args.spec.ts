import { Language, Store } from '@prisma/client';
import { getFortuneWheelItemArgs } from '../../fortune-wheel/prisma-args/fortune-wheel.prisma.args';
import { getStoreArgs, selectStoreOBJ } from '../prisma-args/store.prisma.args';

describe('Store City Display & Pagination Prisma Args Suite', () => {
  describe('selectStoreOBJ() city fields inclusion', () => {
    it('includes cityId: true in standard store selection', () => {
      const select = selectStoreOBJ();
      expect(select).toHaveProperty('cityId', true);
    });

    it('includes city relation with id and name in standard store selection', () => {
      const select = selectStoreOBJ() as any;
      expect(select).toHaveProperty('city');
      expect(select.city).toEqual({
        select: {
          id: true,
          name: true,
        },
      });
    });

    it('preserves cityId and city fields when includeBundles is true', () => {
      const select = selectStoreOBJ(true) as any;
      expect(select).toHaveProperty('cityId', true);
      expect(select.city).toEqual({
        select: {
          id: true,
          name: true,
        },
      });
      expect(select).toHaveProperty('Bundles');
    });
  });

  describe('getStoreArgs() cityId filtering & isolation', () => {
    const emptyLanguages: Language[] = [];
    const emptyStores: Store[] = [];

    it('adds { cityId: 1 } to where.AND when cityId=1 (El Mahalla El Kubra) is filtered', () => {
      const args = getStoreArgs(
        { cityId: 1 } as any,
        emptyLanguages,
        emptyStores,
      );
      const whereAnd = args.where?.AND as any[];
      expect(whereAnd).toBeDefined();
      const cityCondition = whereAnd.find((item) => item?.cityId === 1);
      expect(cityCondition).toEqual({ cityId: 1 });
    });

    it('adds { cityId: 2 } to where.AND when cityId=2 (Tanta) is filtered', () => {
      const args = getStoreArgs(
        { cityId: 2 } as any,
        emptyLanguages,
        emptyStores,
      );
      const whereAnd = args.where?.AND as any[];
      expect(whereAnd).toBeDefined();
      const cityCondition = whereAnd.find((item) => item?.cityId === 2);
      expect(cityCondition).toEqual({ cityId: 2 });
    });

    it('enforces strict city isolation using resolvedCityId when customer city is resolved', () => {
      const args = getStoreArgs(
        {} as any,
        emptyLanguages,
        emptyStores,
        false,
        true, // enforceVisible
        false,
        1, // resolvedCityId = 1 (Mahalla)
      );
      const whereAnd = args.where?.AND as any[];
      const isolatedCityCondition = whereAnd.find(
        (item) => item?.cityId === 1,
      );
      expect(isolatedCityCondition).toEqual({ cityId: 1 });
    });
  });

  describe('Unlimited Pagination (limit: -1) verification', () => {
    const emptyLanguages: Language[] = [];
    const emptyStores: Store[] = [];

    it('does NOT include take or skip in getStoreArgs when limit=-1', () => {
      const args = getStoreArgs(
        { limit: -1 } as any,
        emptyLanguages,
        emptyStores,
      );
      expect(args.take).toBeUndefined();
      expect(args.skip).toBeUndefined();
    });

    it('includes take and skip when regular positive limit is specified', () => {
      const args = getStoreArgs(
        { limit: 15, page: 2 } as any,
        emptyLanguages,
        emptyStores,
      );
      expect(args.take).toBe(15);
      expect(args.skip).toBe(15);
    });

    it('does NOT include take or skip in getFortuneWheelItemArgs when limit=-1', () => {
      const args = getFortuneWheelItemArgs({ limit: -1 } as any);
      expect(args.take).toBeUndefined();
      expect(args.skip).toBeUndefined();
    });
  });
});
