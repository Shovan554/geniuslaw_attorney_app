import { Stack } from 'expo-router';

export default function CallsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 450,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'fullScreenModal',
          gestureEnabled: false,
          animation: 'fade',
        }}
      />
    </Stack>
  );
}
