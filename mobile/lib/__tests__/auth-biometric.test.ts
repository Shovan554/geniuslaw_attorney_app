import * as SecureStore from 'expo-secure-store';
import {
  isBiometricEnabled, getBiometricUser, enableBiometric, disableBiometric, biometricLogin, signOut,
} from '../auth';

const USER = { id: 7, email: 'jane@firm.com', role: 'attorney', firm_id: 1, attorney_id: 3, full_name: 'Jane Doe', initials: 'JD' };

async function seedSession() {
  await SecureStore.setItemAsync('gla_access_token', 'old-access');
  await SecureStore.setItemAsync('gla_refresh_token', 'refresh-123');
  await SecureStore.setItemAsync('gla_user', JSON.stringify(USER));
}

afterEach(() => { (global as any).fetch = undefined; });

test('isBiometricEnabled false by default, true after enable', async () => {
  expect(await isBiometricEnabled()).toBe(false);
  await seedSession();
  expect(await enableBiometric()).toBe(true);
  expect(await isBiometricEnabled()).toBe(true);
});

test('enableBiometric returns false with no active session', async () => {
  expect(await enableBiometric()).toBe(false);
  expect(await isBiometricEnabled()).toBe(false);
});

test('enableBiometric snapshots refresh + user into bio keys', async () => {
  await seedSession();
  await enableBiometric();
  expect(await SecureStore.getItemAsync('gla_biometric_refresh')).toBe('refresh-123');
  expect(await getBiometricUser()).toEqual(USER);
});

test('disableBiometric clears all three bio keys', async () => {
  await seedSession();
  await enableBiometric();
  await disableBiometric();
  expect(await isBiometricEnabled()).toBe(false);
  expect(await getBiometricUser()).toBeNull();
  expect(await SecureStore.getItemAsync('gla_biometric_refresh')).toBeNull();
});

test('biometricLogin error when not enrolled', async () => {
  const res = await biometricLogin();
  expect(res.status).toBe('error');
});

test('biometricLogin success restores session keys', async () => {
  await seedSession();
  await enableBiometric();
  // simulate logout clearing session keys but leaving bio keys
  await SecureStore.deleteItemAsync('gla_access_token');
  await SecureStore.deleteItemAsync('gla_refresh_token');
  await SecureStore.deleteItemAsync('gla_user');
  (global as any).fetch = jest.fn(async () => ({
    ok: true, json: async () => ({ access_token: 'new-access' }),
  }));

  const res = await biometricLogin();
  expect(res.status).toBe('success');
  expect(await SecureStore.getItemAsync('gla_access_token')).toBe('new-access');
  expect(await SecureStore.getItemAsync('gla_refresh_token')).toBe('refresh-123');
  expect(await getBiometricUser()).toEqual(USER); // bio keys still intact
});

test('biometricLogin clears bio keys when server rejects refresh', async () => {
  await seedSession();
  await enableBiometric();
  (global as any).fetch = jest.fn(async () => ({
    ok: false, status: 401, json: async () => ({ detail: 'expired' }),
  }));

  const res = await biometricLogin();
  expect(res.status).toBe('error');
  expect(await isBiometricEnabled()).toBe(false);
  expect(await SecureStore.getItemAsync('gla_biometric_refresh')).toBeNull();
});

test('signOut preserves biometric keys but clears session keys', async () => {
  await seedSession();
  await enableBiometric();
  await signOut();
  // biometric keys survive logout
  expect(await isBiometricEnabled()).toBe(true);
  expect(await getBiometricUser()).toEqual(USER);
  expect(await SecureStore.getItemAsync('gla_biometric_refresh')).toBe('refresh-123');
  // session keys are gone
  expect(await SecureStore.getItemAsync('gla_access_token')).toBeNull();
  expect(await SecureStore.getItemAsync('gla_refresh_token')).toBeNull();
});
