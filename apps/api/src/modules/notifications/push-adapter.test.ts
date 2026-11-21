import { PUSH_COPY } from '@daminatofit/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ExpoPushAdapter, MockPushAdapter, pushCopyMatches } from './push-adapter';

const generic = {
  to: 'ExponentPushToken[zzzzzzzzzzzzzzzz]',
  title: PUSH_COPY.direct_message.title,
  body: PUSH_COPY.direct_message.body,
  data: {
    kind: 'direct_message' as const,
    entityId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
  },
};

describe('push adapter', () => {
  it('rejects payloads that are not the generic copy', () => {
    expect(pushCopyMatches(generic)).toBe(true);
    expect(
      pushCopyMatches({
        ...generic,
        body: 'Tu rutina nueva pesa 80 kg',
      }),
    ).toBe(false);
  });

  it('does not call Expo when the access token is missing', async () => {
    const fetchImpl = vi.fn();
    const adapter = new ExpoPushAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await adapter.send(generic);
    expect(result).toEqual({ ok: false, error: 'transient', message: 'missing_expo_access_token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps DeviceNotRegistered and never forwards private text', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { body: string; data: Record<string, string> };
      expect(body.body).toBe(PUSH_COPY.direct_message.body);
      expect(body.data).not.toHaveProperty('text');
      expect(JSON.stringify(body)).not.toMatch(/80 kg|rutina/);
      return new Response(
        JSON.stringify({
          data: {
            status: 'error',
            message: 'not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        }),
        { status: 200 },
      );
    });
    const adapter = new ExpoPushAdapter({
      accessToken: 'test-token-not-a-real-credential',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await adapter.send(generic);
    expect(result).toEqual({ ok: false, error: 'invalid_token', message: 'DeviceNotRegistered' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('scripts mock failures without marking them sent', async () => {
    const adapter = new MockPushAdapter();
    adapter.failNext({ ok: false, error: 'transient', message: 'offline' });
    const failed = await adapter.send(generic);
    const ok = await adapter.send(generic);
    expect(failed.ok).toBe(false);
    expect(ok).toEqual({ ok: true, ticketId: 'mock-1' });
    expect(adapter.attempts).toHaveLength(2);
    expect(adapter.sent).toHaveLength(1);
  });
});
