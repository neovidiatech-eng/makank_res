// The controller transitively imports the UploadFile decorator, which imports `uuid`
// (shipped as ESM and not transformed by the repo's ts-jest config). Mock it so this
// suite can load — we only exercise the GET access policy here.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BundleController } from '../bundle.controller';

describe('BundleController GET access policy', () => {
  const buildController = () => {
    const service = {
      findAll: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const response = { success: jest.fn() };
    return {
      controller: new BundleController(service as any, response as any),
      service,
      response,
    };
  };
  const res = {} as any;

  it('rejects an unauthenticated list with no storeId (no accidental all-platform catalogue)', async () => {
    const { controller, service } = buildController();
    await expect(
      controller.findAll(res, {} as any, undefined as any),
    ).rejects.toThrow('storeId is required');
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('allows a visitor list scoped to a single store', async () => {
    const { controller, service, response } = buildController();
    await controller.findAll(res, { storeId: 1 } as any, undefined as any);
    expect(service.findAll).toHaveBeenCalledWith({ storeId: 1 }, false);
    expect(response.success).toHaveBeenCalled();
  });

  it('allows a visitor to fetch a single bundle by id', async () => {
    const { controller, service } = buildController();
    await controller.findAll(res, { id: 5 } as any, undefined as any);
    expect(service.findAll).toHaveBeenCalledWith({ id: 5 }, false);
  });

  it('lets an admin browse across stores and see inactive bundles', async () => {
    const { controller, service } = buildController();
    await controller.findAll(
      res,
      {} as any,
      { Role: { roleKey: 'Admin' } } as any,
    );
    expect(service.findAll).toHaveBeenCalledWith({}, true);
  });
});
