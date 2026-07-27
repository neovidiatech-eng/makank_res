import { BadRequestException } from '@nestjs/common';

import { ParseJsonBody } from './parse-json-body.interceptor';

const createContext = (body: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  }) as any;

const createNext = () =>
  ({
    handle: jest.fn(),
  }) as any;

describe('ParseJsonBody', () => {
  it('parses configured JSON fields and scalar multipart values', () => {
    const body: Record<string, unknown> = {
      stops:
        '[{"lat":30.0444,"lng":31.2357,"imageIds":[1,2]},{"lat":30.0566,"lng":31.2394,"imageIds":[3]}]',
      paidWithWallet: 'false',
      tip: '0',
    };
    const Interceptor = ParseJsonBody(['stops']) as any;
    const interceptor = new Interceptor();
    const next = createNext();

    interceptor.intercept(createContext(body), next);

    expect(body.stops).toEqual([
      { lat: 30.0444, lng: 31.2357, imageIds: [1, 2] },
      { lat: 30.0566, lng: 31.2394, imageIds: [3] },
    ]);
    expect(body.paidWithWallet).toBe(false);
    expect(body.tip).toBe(0);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON instead of leaving the field as a string', () => {
    const body: Record<string, unknown> = {
      stops:
        '[{"lat":30.0444,"lng":31.2357,"imageIds":[ID1,ID2]},{"lat":30.0566,"lng":31.2394,"imageIds":[ID3]}]',
    };
    const Interceptor = ParseJsonBody(['stops']) as any;
    const interceptor = new Interceptor();

    expect(() =>
      interceptor.intercept(createContext(body), createNext()),
    ).toThrow(BadRequestException);
  });

  it('names the offending field in the error (ResponseService *property* 0KEY0 form)', () => {
    const body: Record<string, unknown> = { stops: '[{"lat":1},' }; // truncated → invalid
    const Interceptor = ParseJsonBody(['stops']) as any;
    const interceptor = new Interceptor();

    try {
      interceptor.intercept(createContext(body), createNext());
      throw new Error('expected a BadRequestException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BadRequestException);
      // raw message carries the field so ResponseService can interpolate it
      // into response.invalidJson as {property}
      expect(e.message).toBe('*stops* 0invalidJson0');
    }
  });
});
