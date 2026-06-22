import * as SecureStore from 'expo-secure-store';

test('secure-store mock round-trips a value', async () => {
  await SecureStore.setItemAsync('k', 'v');
  expect(await SecureStore.getItemAsync('k')).toBe('v');
  await SecureStore.deleteItemAsync('k');
  expect(await SecureStore.getItemAsync('k')).toBeNull();
});
