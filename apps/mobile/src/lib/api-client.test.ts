import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import { fetchJson } from './api-client';

describe('fetchJson', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends brand, tenant, cookie, and bearer headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"ok":true}',
      headers: new Headers(),
    });
    global.fetch = fetchMock;

    const getCookie = jest.fn().mockResolvedValue('session=abc');
    await fetchJson(
      {
        brandId: 'daminatofit',
        activeTenantId: 'tenant-1',
        authClient: { getCookie } as never,
      },
      '/v1/me',
    );

    expect(getCookie).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get(APP_BRAND_HEADER)).toBe('daminatofit');
    expect(headers.get(TENANT_ID_HEADER)).toBe('tenant-1');
    expect(headers.get('cookie')).toBe('session=abc');
  });
});
