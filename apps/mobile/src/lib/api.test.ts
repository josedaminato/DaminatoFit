import { APP_BRAND_HEADER } from '@daminatofit/contracts';
import { fetchHealth } from './api';

const healthy = { status: 'ok', service: 'daminatofit-api', version: '1.0.0', uptimeSeconds: 3 };

describe('fetchHealth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends the brand header and validates the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => healthy });
    global.fetch = fetchMock;

    await expect(fetchHealth('http://api.test', 'pupiapp')).resolves.toEqual(healthy);
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/health', {
      headers: { [APP_BRAND_HEADER]: 'pupiapp' },
    });
  });

  it('rejects responses that do not match the contract', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ...healthy, service: 'other' }) });

    await expect(fetchHealth('http://api.test', 'pupiapp')).rejects.toThrow();
  });

  it('rejects non-2xx responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(fetchHealth('http://api.test', 'pupiapp')).rejects.toThrow(/503/);
  });
});
