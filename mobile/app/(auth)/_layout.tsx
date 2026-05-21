import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { hasSession } from '../../lib/auth';

export default function AuthLayout() {
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
      <Stack.Screen name="cases" />
      <Stack.Screen name="clients" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
