// ValidateName() mirrors ar->en / en->ar whenever only one locale key is
// sent, so a genuine partial update like `{ name: { ar: "New" } }` used to
// silently clobber the other language once it reached the DB (the mirror
// makes both keys equal before store.service.ts ever sees them). This
// interceptor runs pre-Pipe and merges against the store's current stored
// name instead, so only the locale actually sent gets changed.
import { MergeStoreNameInterceptor } from '../interceptors/merge-store-name.interceptor';

const buildContext = (body: any, params: any = { id: '42' }) => ({
  switchToHttp: () => ({
    getRequest: () => ({ body, params }),
  }),
});

const nextHandle = { handle: jest.fn().mockReturnValue('handled') };

describe('MergeStoreNameInterceptor', () => {
  it('fills in the missing locale from the stored value on a partial update', async () => {
    const interceptor = new MergeStoreNameInterceptor();
    (interceptor as any).prisma = {
      store: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: { en: 'Pizza House', ar: 'بيت البيتزا' } }),
      },
    };
    const body: any = { name: { ar: 'بيت البيتزا الجديد' } };
    const context = buildContext(body);

    await interceptor.intercept(context as any, nextHandle as any);

    expect(body.name).toEqual({
      en: 'Pizza House',
      ar: 'بيت البيتزا الجديد',
    });
  });

  it('leaves a full ar+en submission untouched (no DB lookup)', async () => {
    const findUnique = jest.fn();
    const interceptor = new MergeStoreNameInterceptor();
    (interceptor as any).prisma = { store: { findUnique } };
    const body: any = { name: { en: 'New Name', ar: 'اسم جديد' } };

    await interceptor.intercept(buildContext(body) as any, nextHandle as any);

    expect(body.name).toEqual({ en: 'New Name', ar: 'اسم جديد' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when name is absent from the body', async () => {
    const findUnique = jest.fn();
    const interceptor = new MergeStoreNameInterceptor();
    (interceptor as any).prisma = { store: { findUnique } };
    const body: any = { storeOrder: 3 };

    await interceptor.intercept(buildContext(body) as any, nextHandle as any);

    expect(body).toEqual({ storeOrder: 3 });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
