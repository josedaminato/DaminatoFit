import { PUSH_COPY } from '@daminatofit/contracts';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: {
    kind: 'announcement' | 'direct_message';
    entityId: string;
    tenantId: string;
  };
}

export type PushSendResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: 'invalid_token' | 'transient'; message: string };

export interface PushAdapter {
  readonly name: 'mock' | 'expo';
  send(message: PushMessage): Promise<PushSendResult>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function pushCopyMatches(message: Pick<PushMessage, 'title' | 'body' | 'data'>): boolean {
  if (message.data.kind !== 'announcement' && message.data.kind !== 'direct_message') {
    return false;
  }
  const copy = PUSH_COPY[message.data.kind];
  return message.title === copy.title && message.body === copy.body;
}

export class MockPushAdapter implements PushAdapter {
  readonly name = 'mock' as const;
  readonly attempts: PushMessage[] = [];
  readonly sent: PushMessage[] = [];
  private scripted: PushSendResult[] = [];

  failNext(result: Extract<PushSendResult, { ok: false }>): void {
    this.scripted.push(result);
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    this.attempts.push(message);
    const next = this.scripted.shift();
    if (next) return next;
    const ticketId = `mock-${this.sent.length + 1}`;
    this.sent.push(message);
    return { ok: true, ticketId };
  }
}

interface ExpoPushOptions {
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export class ExpoPushAdapter implements PushAdapter {
  readonly name = 'expo' as const;

  constructor(private readonly options: ExpoPushOptions) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    if (!pushCopyMatches(message)) {
      return { ok: false, error: 'transient', message: 'payload_rejected' };
    }
    if (!this.options.accessToken) {
      return { ok: false, error: 'transient', message: 'missing_expo_access_token' };
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.accessToken}`,
        },
        body: JSON.stringify({
          to: message.to,
          title: message.title,
          body: message.body,
          data: message.data,
          priority: 'default',
        }),
      });
    } catch {
      return { ok: false, error: 'transient', message: 'expo_unreachable' };
    }

    if (response.status === 429 || response.status >= 500) {
      return { ok: false, error: 'transient', message: `expo_http_${response.status}` };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false, error: 'transient', message: 'expo_invalid_response' };
    }

    const ticket = readExpoTicket(parsed);
    if (!ticket) return { ok: false, error: 'transient', message: 'expo_invalid_response' };
    if (ticket.status === 'ok' && ticket.id) return { ok: true, ticketId: ticket.id };
    if (ticket.detailsError === 'DeviceNotRegistered') {
      return { ok: false, error: 'invalid_token', message: 'DeviceNotRegistered' };
    }
    return {
      ok: false,
      error: 'transient',
      message: ticket.detailsError ?? ticket.message ?? 'expo_error',
    };
  }
}

function readExpoTicket(value: unknown): {
  status?: string;
  id?: string;
  message?: string;
  detailsError?: string;
} | null {
  if (!value || typeof value !== 'object' || !('data' in value)) return null;
  const data = (value as { data: unknown }).data;
  const ticket = Array.isArray(data) ? data[0] : data;
  if (!ticket || typeof ticket !== 'object') return null;
  const record = ticket as { status?: unknown; id?: unknown; message?: unknown; details?: unknown };
  const details =
    record.details && typeof record.details === 'object'
      ? (record.details as { error?: unknown }).error
      : undefined;
  return {
    status: typeof record.status === 'string' ? record.status : undefined,
    id: typeof record.id === 'string' ? record.id : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    detailsError: typeof details === 'string' ? details : undefined,
  };
}

export function createPushAdapter(input: {
  provider: 'mock' | 'expo';
  accessToken?: string;
}): PushAdapter {
  if (input.provider === 'expo') {
    return new ExpoPushAdapter({ accessToken: input.accessToken });
  }
  return new MockPushAdapter();
}
