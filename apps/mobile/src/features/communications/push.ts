/** Permission is requested from the communications screen, never at launch. */
export const ASK_PUSH_ON_LAUNCH = false;

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PushClient {
  getPermission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  getToken(): Promise<string | null>;
}

export type PushEnableResult = 'granted' | 'denied' | 'unavailable';

export async function enablePushFromUserAction(client: PushClient): Promise<PushEnableResult> {
  const current = await client.getPermission();
  if (current === 'denied') return 'denied';
  const next = current === 'granted' ? 'granted' : await client.requestPermission();
  if (next !== 'granted') return 'denied';
  const token = await client.getToken();
  return token ? 'granted' : 'unavailable';
}
