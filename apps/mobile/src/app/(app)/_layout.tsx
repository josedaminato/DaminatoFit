import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { canOpenNotification, routeForNotificationData } from '@/features/communications/routing';
import { useSession } from '@/lib/session';

function NotificationBridge() {
  const { me, isAuthenticated, setActiveTenantId } = useSession();

  useEffect(() => {
    if (!isAuthenticated) return;
    let remove = () => undefined;
    let cancelled = false;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const open = async (data: unknown) => {
          const route = routeForNotificationData(data);
          if (!route) return;
          const tenants = me?.memberships.map((membership) => membership.tenantId) ?? [];
          if (!canOpenNotification(tenants, route.tenantId)) return;
          await setActiveTenantId(route.tenantId);
          const { router } = await import('expo-router');
          router.push(route.pathname as never);
        };
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled && last) await open(last.notification.request.content.data);
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          void open(response.notification.request.content.data);
        });
        remove = () => {
          subscription.remove();
        };
      } catch {
        // The runtime has no push module. In-app notices still load from the API.
      }
    })();

    return () => {
      cancelled = true;
      remove();
    };
  }, [isAuthenticated, me, setActiveTenantId]);

  return null;
}

export default function AppLayout() {
  const { colors } = useBrand();
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  return (
    <>
      <NotificationBridge />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
