// Regression for the `{"message": "response.]* "}` banner-creation response.
//
// Root cause: the `@ValidateExist` array validator throws a marker string of
// the form `*[<ids>]* 0EXIST0`. ResponseService.translateMessage extracts the
// `0KEY0` token to build the i18n key. When the *property* value contained a
// "0" (e.g. `*[10]*`, or `*[0]*` from an empty-string-coerced zoneId), the
// key-extraction regex latched onto the wrong "0...0" span and produced the
// garbage key `]* ` -> `response.]* `.
//
// These tests pin the fixed behaviour: the property is stripped before the key
// is extracted, so the key is always `EXIST` regardless of digits in the value.
import { ResponseService } from 'src/globals/services/response.service';

type TranslateArgs = { key: string; args?: Record<string, unknown> };

const buildService = () => {
  const calls: TranslateArgs[] = [];
  const i18n = {
    translate: jest.fn((key: string, opts?: { args?: any }) => {
      calls.push({ key, args: opts?.args });
      // Echo a rendered string so we can assert the property interpolation too.
      const property = opts?.args?.property;
      return property !== undefined ? `${property} does not exist` : key;
    }),
  };
  const service = new ResponseService(i18n as any);
  return { service, i18n, calls };
};

const buildRes = (locale = 'en') => {
  const json = jest.fn();
  const res: any = {
    req: { headers: { locale } },
    status: jest.fn(() => ({ json })),
  };
  res._json = json;
  return res;
};

describe('ResponseService — EXIST marker parsing', () => {
  it.each([
    ['*[0]* 0EXIST0', '[0]'], // empty-string zoneId coerced to 0
    ['*[10]* 0EXIST0', '[10]'], // id containing a 0
    ['*[10,20]* 0EXIST0', '[10,20]'], // multiple ids with 0s
    ['0EXIST0 *0*', '0'], // single-id default-message form
  ])(
    'maps marker %s to the EXIST key (never response.]* )',
    async (marker, expectedProperty) => {
      const { service, i18n, calls } = buildService();
      const res = buildRes('en');

      await service.badRequest(res, marker);

      // The i18n key must be the clean EXIST key, with the real value as arg.
      expect(i18n.translate).toHaveBeenCalledWith(
        'response.EXIST',
        expect.objectContaining({ args: { property: expectedProperty } }),
      );
      // No garbage key was ever attempted.
      expect(calls.some((c) => c.key.includes(']*'))).toBe(false);

      // And the response body is human-readable, not `response.]* `.
      const body = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(body.message).toBe(`${expectedProperty} does not exist`);
    },
  );
});
