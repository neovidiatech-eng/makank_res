import { filterJsonKeyWithRawSQL } from 'src/globals/helpers/prisma-filters';
import { getStoreArgs } from '../prisma-args/store.prisma.args';

describe('Store Search & Arabic Normalization Tests', () => {
  const mockLanguages = [{ key: 'ar' }, { key: 'en' }];

  describe('filterJsonKeyWithRawSQL Arabic & Case Variants', () => {
    it('generates case variants for English queries', () => {
      const filter = { name: 'Burger' } as any;
      const result = filterJsonKeyWithRawSQL(filter, 'name', mockLanguages) as any;

      expect(result).toBeDefined();
      expect(result.OR).toBeDefined();

      const englishContains = result.OR
        .filter((o: any) => o.name.path === '$.en')
        .map((o: any) => o.name.string_contains);

      expect(englishContains).toContain('Burger');
      expect(englishContains).toContain('burger');
      expect(englishContains).toContain('BURGER');
    });

    it('generates Arabic variants for Alef with Hamza (إ / أ / آ -> ا)', () => {
      const filter = { name: 'إسطنبول' } as any;
      const result = filterJsonKeyWithRawSQL(filter, 'name', mockLanguages) as any;

      expect(result).toBeDefined();
      const arabicContains = result.OR
        .filter((o: any) => o.name.path === '$.ar')
        .map((o: any) => o.name.string_contains);

      // Must include original and normalized plain Alef variant
      expect(arabicContains).toContain('إسطنبول');
      expect(arabicContains).toContain('اسطنبول');
    });

    it('generates Arabic variants for Taa Marbouta and Haa (ة <-> ه)', () => {
      const filter = { name: 'عصيرة' } as any;
      const result = filterJsonKeyWithRawSQL(filter, 'name', mockLanguages) as any;

      const arabicContains = result.OR
        .filter((o: any) => o.name.path === '$.ar')
        .map((o: any) => o.name.string_contains);

      expect(arabicContains).toContain('عصيرة');
      expect(arabicContains).toContain('عصيره');
    });

    it('generates Arabic variants for Yaa and Alef Maksura (ي <-> ى)', () => {
      const filter = { name: 'علي' } as any;
      const result = filterJsonKeyWithRawSQL(filter, 'name', mockLanguages) as any;

      const arabicContains = result.OR
        .filter((o: any) => o.name.path === '$.ar')
        .map((o: any) => o.name.string_contains);

      expect(arabicContains).toContain('علي');
      expect(arabicContains).toContain('على');
    });
  });

  describe('getStoreArgs Search Mapping', () => {
    it('maps query.search to filter.name and generates JSON search', () => {
      const query = { search: 'بمزاج' } as any;
      const args = getStoreArgs(query, mockLanguages as any, [], false, false, false);

      const whereClause = args.where;
      expect(whereClause).toBeDefined();
      expect(whereClause.AND).toBeDefined();

      // Ensure name filter was added
      const andList = Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND];
      const hasNameFilter = andList.some((condition: any) => {
        return condition && condition.OR && condition.OR.some((sub: any) => sub.name && sub.name.path === '$.ar');
      });

      expect(hasNameFilter).toBe(true);
    });

    it('maps numeric search query to exact id matching', () => {
      const query = { search: '164' } as any;
      const args = getStoreArgs(query, mockLanguages as any, [], false, false, false);

      const whereClause = args.where as any;
      const andList = Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND];
      const hasIdFilter = andList.some((condition: any) => condition && condition.id === 164);
      expect(hasIdFilter).toBe(true);
    });
  });
});
