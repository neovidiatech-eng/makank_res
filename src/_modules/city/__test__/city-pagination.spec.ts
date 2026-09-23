import { getCityArgs } from '../prisma-args/city.prisma.args';
import { getZoneArgs } from '../../zone/prisma-args/zone.prisma.args';

describe('City & Zone Master Data Unconstrained Pagination Spec', () => {
  const dummyLanguages: any[] = [{ id: 1, key: 'ar' }, { id: 2, key: 'en' }];

  describe('City Pagination (getCityArgs)', () => {
    it('1. When neither limit nor page is provided (general lookup/dropdown) -> no pagination limits (take/skip undefined) so all cities return', () => {
      const args = getCityArgs({}, dummyLanguages);
      expect((args as any).take).toBeUndefined();
      expect((args as any).skip).toBeUndefined();
    });

    it('2. When limit: 1000 is requested (e.g. mobile app, dashboard city selector) -> take: 1000 and not clamped to 40', () => {
      const args = getCityArgs({ limit: 1000 }, dummyLanguages);
      expect((args as any).take).toBe(1000);
      expect((args as any).skip).toBe(0);
    });

    it('3. When limit: -1 is requested -> completely unpaginated (take/skip undefined)', () => {
      const args = getCityArgs({ limit: -1 }, dummyLanguages);
      expect((args as any).take).toBeUndefined();
      expect((args as any).skip).toBeUndefined();
    });

    it('4. When page and limit are provided (e.g. admin table /dashboard/cities) -> accurately paginates with take and skip', () => {
      const args = getCityArgs({ page: 3, limit: 15 }, dummyLanguages);
      expect((args as any).take).toBe(15);
      expect((args as any).skip).toBe(30);
    });

    it('5. Default active filter is active: true when active is omitted', () => {
      const args = getCityArgs({}, dummyLanguages);
      expect(args.where?.AND).toContainEqual({ active: true });
    });
  });

  describe('Zone Pagination (getZoneArgs)', () => {
    it('1. When neither limit nor page is provided (e.g. fetching zones for a city) -> returns all zones without clamping to 10', () => {
      const args = getZoneArgs({ cityId: 5 }, dummyLanguages);
      expect((args as any).take).toBeUndefined();
      expect((args as any).skip).toBeUndefined();
    });

    it('2. When limit: 1000 is requested -> take: 1000 and not clamped to 40', () => {
      const args = getZoneArgs({ limit: 1000, cityId: 5 }, dummyLanguages);
      expect((args as any).take).toBe(1000);
      expect((args as any).skip).toBe(0);
    });

    it('3. When limit: -1 is requested -> completely unpaginated (take/skip undefined)', () => {
      const args = getZoneArgs({ limit: -1 }, dummyLanguages);
      expect((args as any).take).toBeUndefined();
      expect((args as any).skip).toBeUndefined();
    });

    it('4. When page and limit are provided -> accurately paginates for admin CRUD', () => {
      const args = getZoneArgs({ page: 2, limit: 20 }, dummyLanguages);
      expect((args as any).take).toBe(20);
      expect((args as any).skip).toBe(20);
    });
  });
});
