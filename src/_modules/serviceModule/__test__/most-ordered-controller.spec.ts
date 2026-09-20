import { ServiceModuleController } from '../controllers/serviceModule.controller';

describe('ServiceModuleController — Most Ordered Endpoints', () => {
  let controller: ServiceModuleController;
  let mockService: any;
  let mockResponse: any;
  let mockRes: any;

  beforeEach(() => {
    mockService = {
      getMostOrdered: jest.fn().mockResolvedValue([
        { id: 1, name: 'Burger', price: 50 },
        { id: 2, name: 'Pizza', price: 90 },
      ]),
      findAll: jest.fn().mockResolvedValue([
        { id: 1, name: 'Burger', price: 50 },
      ]),
      count: jest.fn().mockResolvedValue(1),
    };

    mockResponse = {
      success: jest.fn((res, msg, data) => ({ message: msg, data })),
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    controller = new ServiceModuleController(mockService, mockResponse);
  });

  it('GET /services/most-ordered calls getMostOrdered with parsed parameters', async () => {
    const result = await controller.getMostOrdered(
      mockRes,
      '5',       // cityId
      '30.97',   // lat
      '31.16',   // lng
      '15',      // limit
      { id: 42 },// user
    );

    expect(mockService.getMostOrdered).toHaveBeenCalledWith({
      cityId: 5,
      lat: 30.97,
      lng: 31.16,
      limit: 15,
      customerId: 42,
    });
    expect(mockResponse.success).toHaveBeenCalledWith(
      mockRes,
      'Most ordered services fetched successfully',
      expect.any(Array),
    );
  });

  it('GET /services with mostSeller=true delegates to getMostOrdered in findAll', async () => {
    mockService.findAll.mockImplementation(async (filters: any) => {
      if (filters.mostSeller) {
        return mockService.getMostOrdered({
          cityId: filters.cityId,
          limit: filters.limit ? +filters.limit : 10,
          customerId: filters.customerId,
        });
      }
      return [];
    });

    await controller.findAll(mockRes, { mostSeller: true, cityId: 3 } as any);

    expect(mockService.getMostOrdered).toHaveBeenCalledWith(
      expect.objectContaining({
        cityId: 3,
        limit: 10,
      }),
    );
  });
});
