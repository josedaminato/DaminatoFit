import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';

export default function Index() {
  const { colors } = useBrand();
  const { isLoading, isAuthenticated, isTrainer, isStudent, me, activeMembership } = useSession();

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

  if (isTrainer) {
    return <Redirect href="/trainer" />;
  }

  if (isStudent) {
    if (me && me.memberships.filter((m) => m.role === 'student').length > 1 && !activeMembership) {
      return <Redirect href="/student/select-trainer" />;
    }
    return <Redirect href="/student" />;
  }

  if (me && me.memberships.length === 0) {
    return <Redirect href="/welcome" />;
  }

  return <Redirect href="/settings" />;
}
