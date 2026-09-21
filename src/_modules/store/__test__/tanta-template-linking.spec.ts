import { getStoreArgs } from '../prisma-args/store.prisma.args';

describe('Tanta StoreTemplate & TemplateCategory Linking Specs', () => {
  const mockLanguages = [
    { code: 'ar', key: 'ar' },
    { code: 'en', key: 'en' },
  ];

  it('1. Generates correct TemplateApplications filter when templateId is passed', () => {
    const filter: any = {
      templateId: 1,
    };

    const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, null);
    const whereStr = JSON.stringify(args.where);

    expect(whereStr).toContain('"TemplateApplications"');
    expect(whereStr).toContain('"templateId":1');
  });

  it('2. Generates correct SubCategories filter when templateCategoryId is passed', () => {
    const filter: any = {
      templateCategoryId: 4,
    };

    const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, null);
    const whereStr = JSON.stringify(args.where);

    expect(whereStr).toContain('"SubCategories"');
    expect(whereStr).toContain('"templateCategoryId":4');
  });

  it('3. Combines cityId=2 (Tanta) with templateId=1 with strict isolation', () => {
    const filter: any = {
      cityId: 2,
      templateId: 1,
    };

    const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, 2);
    const whereStr = JSON.stringify(args.where);

    expect(whereStr).toContain('"cityId":2');
    expect(whereStr).toContain('"TemplateApplications"');
    expect(whereStr).toContain('"templateId":1');
    expect(whereStr).not.toContain('"cityId":1');
  });

  it('4. Combines cityId=2, templateId=1, and templateCategoryId=5 seamlessly', () => {
    const filter: any = {
      cityId: 2,
      templateId: 1,
      templateCategoryId: 5,
    };

    const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, 2);
    const whereStr = JSON.stringify(args.where);

    expect(whereStr).toContain('"cityId":2');
    expect(whereStr).toContain('"templateId":1');
    expect(whereStr).toContain('"templateCategoryId":5');
  });

  it('5. Mahalla customer (cityId=1) requesting same templateId never matches cityId=2', () => {
    const filter: any = {
      cityId: 1,
      templateId: 1,
    };

    const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, 1);
    const whereStr = JSON.stringify(args.where);

    expect(whereStr).toContain('"cityId":1');
    expect(whereStr).not.toContain('"cityId":2');
    expect(whereStr).toContain('"templateId":1');
  });
});
