import { DEFAULT_APPEARANCE, getBrand, resolveAppearanceTokens } from '@daminatofit/brand';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { BrandContext } from '@/brand/BrandProvider';
import { AnnouncementForm, MessageComposer } from './TrainerComposer';
import { StudentInbox } from './StudentInbox';
import { ASK_PUSH_ON_LAUNCH, enablePushFromUserAction } from './push';
import { canOpenNotification, routeForNotificationData } from './routing';
import { whatsappUrl } from './whatsapp';
import type { AnnouncementItem, DirectMessageItem, UnreadCounts } from './api';

const notice = (title: string, tenantId: string): AnnouncementItem => ({
  id: `${tenantId}-notice`,
  title,
  body: 'cuerpo',
  status: 'published',
  publishedAt: '2026-11-21T12:00:00.000Z',
  archivedAt: null,
  createdAt: '2026-11-21T12:00:00.000Z',
  authorUserId: 'author',
  authorName: 'Ana',
  tenantId,
  readAt: null,
});

const message = (body: string, tenantId: string): DirectMessageItem => ({
  id: `${tenantId}-message`,
  body,
  createdAt: '2026-11-21T12:00:00.000Z',
  readAt: null,
  senderName: 'Ana',
  recipientName: 'Luis',
  recipientMembershipId: 'm1',
  tenantId,
});

const unread = (total: number): UnreadCounts => ({
  announcements: total,
  messages: 0,
  total,
});

async function renderInbox(ui: ReactElement, radiusMd = 10) {
  const brand = getBrand('daminatofit');
  const tokens = resolveAppearanceTokens(DEFAULT_APPEARANCE, 'light');
  return await render(
    <BrandContext.Provider
      value={{
        brand,
        colors: tokens.colors,
        colorScheme: 'light',
        layout: { ...tokens.layout, radiusMd },
        appearanceOverlay: true,
      }}
    >
      {ui}
    </BrandContext.Provider>,
  );
}

describe('communications UI', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('builds a WhatsApp link only for the supplied number', () => {
    expect(whatsappUrl('+5491111111111')).toBe('https://wa.me/5491111111111');
    expect(whatsappUrl('+5492222222222')).not.toContain('5491111111111');
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl('11 5555')).toBeNull();
  });

  it('opens a notification only for a membership the student actually has', () => {
    const route = routeForNotificationData({
      kind: 'direct_message',
      entityId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      body: 'secreto',
    });
    expect(route?.pathname).toBe(
      '/student/communications/messages/11111111-1111-4111-8111-111111111111',
    );
    expect(canOpenNotification(['22222222-2222-4222-8222-222222222222'], route!.tenantId)).toBe(
      true,
    );
    expect(canOpenNotification(['33333333-3333-4333-8333-333333333333'], route!.tenantId)).toBe(
      false,
    );
    expect(routeForNotificationData({ kind: 'chat', entityId: 'x' })).toBeNull();
  });

  it('does not ask for push permission until the user chooses it', async () => {
    expect(ASK_PUSH_ON_LAUNCH).toBe(false);
    const requestPermission = jest.fn(async () => 'denied' as const);
    const result = await enablePushFromUserAction({
      getPermission: async () => 'undetermined',
      requestPermission,
      getToken: async () => null,
    });
    expect(result).toBe('denied');
    expect(requestPermission).toHaveBeenCalledTimes(1);

    const onRequestPush = jest.fn();
    const view = await renderInbox(
      <StudentInbox
        tenantName="Ana"
        announcements={[]}
        messages={[]}
        unread={unread(0)}
        whatsappUrl={null}
        pushStatus="idle"
        onOpenAnnouncement={jest.fn()}
        onOpenMessage={jest.fn()}
        onOpenWhatsapp={jest.fn()}
        onRequestPush={onRequestPush}
      />,
    );
    expect(onRequestPush).not.toHaveBeenCalled();
    expect(view.getByTestId('whatsapp-missing')).toBeTruthy();
    await fireEvent.press(view.getByTestId('push-request'));
    expect(onRequestPush).toHaveBeenCalledTimes(1);
  });

  it('shows the denied state without blocking the inbox', async () => {
    const view = await renderInbox(
      <StudentInbox
        tenantName="Ana"
        announcements={[notice('Cierre', 'tenant-a')]}
        messages={[]}
        unread={unread(1)}
        whatsappUrl="https://wa.me/5491111111111"
        pushStatus="denied"
        onOpenAnnouncement={jest.fn()}
        onOpenMessage={jest.fn()}
        onOpenWhatsapp={jest.fn()}
        onRequestPush={jest.fn()}
      />,
    );
    expect(view.getByTestId('unread-total').props.children).toContain(1);
    expect(view.getByTestId('push-denied')).toBeTruthy();
    expect(view.queryByTestId('push-request')).toBeNull();
  });

  it('replaces communications when the active trainer changes and keeps theme radius', async () => {
    const onOpenWhatsapp = jest.fn();
    const view = await renderInbox(
      <StudentInbox
        tenantName="Entrenador A"
        announcements={[notice('Aviso A', 'tenant-a')]}
        messages={[message('Mensaje A', 'tenant-a')]}
        unread={unread(2)}
        whatsappUrl="https://wa.me/5491111111111"
        pushStatus="idle"
        onOpenAnnouncement={jest.fn()}
        onOpenMessage={jest.fn()}
        onOpenWhatsapp={onOpenWhatsapp}
        onRequestPush={jest.fn()}
      />,
      22,
    );
    expect(view.getByTestId('inbox-tenant').props.children).toContain('Entrenador A');
    expect(view.getByText(/Aviso A/)).toBeTruthy();
    const radius = StyleSheet.flatten(
      view.getByTestId('communication-card').props.style,
    ).borderRadius;
    expect(radius).toBe(22);
    await fireEvent.press(view.getByTestId('whatsapp-button'));
    expect(onOpenWhatsapp).toHaveBeenCalledTimes(1);

    await view.rerender(
      <BrandContext.Provider
        value={{
          brand: getBrand('pupiapp'),
          colors: getBrand('pupiapp').colors.light,
          colorScheme: 'light',
          layout: resolveAppearanceTokens({ ...DEFAULT_APPEARANCE, styleId: 'minimal' }, 'light')
            .layout,
          appearanceOverlay: false,
        }}
      >
        <StudentInbox
          tenantName="Entrenador B"
          announcements={[notice('Aviso B', 'tenant-b')]}
          messages={[message('Mensaje B', 'tenant-b')]}
          unread={unread(0)}
          whatsappUrl="https://wa.me/5492222222222"
          pushStatus="idle"
          onOpenAnnouncement={jest.fn()}
          onOpenMessage={jest.fn()}
          onOpenWhatsapp={jest.fn()}
          onRequestPush={jest.fn()}
        />
      </BrandContext.Provider>,
    );
    expect(view.getByText(/Aviso B/)).toBeTruthy();
    expect(view.queryByText(/Aviso A/)).toBeNull();
    expect(view.queryByText(/Mensaje A/)).toBeNull();
    expect(view.getByText(/Mensaje B/)).toBeTruthy();
  });

  it('saves a draft and publishes an announcement', async () => {
    const onSaveDraft = jest.fn();
    const onPublish = jest.fn();
    const form = await renderInbox(
      <AnnouncementForm onSaveDraft={onSaveDraft} onPublish={onPublish} />,
    );
    await fireEvent.changeText(form.getByTestId('announcement-title'), 'Cierre');
    await fireEvent.changeText(form.getByTestId('announcement-body'), 'El lunes no abrimos.');
    await fireEvent.press(form.getByRole('button', { name: 'Guardar borrador' }));
    expect(onSaveDraft).toHaveBeenCalledWith({ title: 'Cierre', body: 'El lunes no abrimos.' });
    await fireEvent.press(form.getByRole('button', { name: 'Publicar' }));
    expect(onPublish).toHaveBeenCalledWith({ title: 'Cierre', body: 'El lunes no abrimos.' });
  });

  it('sends a personal message only after review', async () => {
    const onSend = jest.fn();
    const composer = await renderInbox(
      <MessageComposer students={[{ id: 'stu-1', name: 'Luis' }]} onSend={onSend} />,
    );
    expect(composer.queryByRole('button', { name: 'Enviar' })).toBeNull();
    await fireEvent.changeText(composer.getByTestId('message-body'), 'Seguí así.');
    await fireEvent.press(composer.getByRole('button', { name: 'Revisar' }));
    expect(composer.getByTestId('message-review-body').props.children).toBe('Seguí así.');
    await fireEvent.press(composer.getByRole('button', { name: 'Enviar' }));
    expect(onSend).toHaveBeenCalledWith({ membershipId: 'stu-1', body: 'Seguí así.' });
  });
});
