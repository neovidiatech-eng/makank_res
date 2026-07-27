import { AttachStoreIdInterceptor } from './attachStoreIdInterceptor.decorator';

describe('AttachStoreIdInterceptor', () => {
  const buildContext = (request: any) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;
  const next = { handle: jest.fn().mockReturnValue('handled') } as any;

  beforeEach(() => next.handle.mockClear());

  it('passes through visitor GET requests that have no authenticated user', () => {
    const interceptor = new AttachStoreIdInterceptor();
    const request = { method: 'GET', user: undefined, body: {}, query: {} };
    expect(() =>
      interceptor.intercept(buildContext(request), next),
    ).not.toThrow();
    expect(next.handle).toHaveBeenCalled();
    expect(request.query).toEqual({});
  });

  it('scopes GET queries to the authenticated store user', () => {
    const interceptor = new AttachStoreIdInterceptor();
    const request = {
      method: 'GET',
      user: { Role: { roleKey: 'Store' }, storeId: 7 },
      body: {},
      query: {},
    };
    interceptor.intercept(buildContext(request), next);
    expect(request.query).toEqual({ storeId: 7 });
  });
});
