import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { getStoredUser, hasSession } from '../../lib/auth';
import { initCallKit } from '../../lib/callKit';
import { attachTapListener, registerForPushNotifications } from '../../lib/notifications';

export default function AuthLayout() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    hasSession().then(setAuthed);
  }, []);

  useEffect(() => {
    if (!authed) return;
    void registerForPushNotifications();
    // Pronto CallKit + PushKit / RNCallKeep + FCM wiring. Native modules
    // are loaded lazily inside initCallKit so this is safe to call even
    // in a dev client that pre-dates the EAS rebuild — it just warns and
    // falls back to the existing in-app active-calls poll.
    void getStoredUser().then((u) => {
      if (u?.id) void initCallKit(u.id);
    });
    const sub = attachTapListener(router);
    return () => sub.remove();
  }, [authed, router]);

  if (authed === null || !fontsLoaded) return null;
  if (!authed) return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 450,
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="pronto" />
      <Stack.Screen name="cases" />
      <Stack.Screen name="clients" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
