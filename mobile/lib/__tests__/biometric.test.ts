import * as LA from 'expo-local-authentication';
import { getBiometricCapability, promptBiometric } from '../biometric';

const mocked = LA as jest.Mocked<typeof LA>;

beforeEach(() => {
  mocked.hasHardwareAsync.mockResolvedValue(true);
  mocked.isEnrolledAsync.mockResolvedValue(true);
  mocked.supportedAuthenticationTypesAsync.mockResolvedValue([LA.AuthenticationType.FACIAL_RECOGNITION]);
  mocked.authenticateAsync.mockResolvedValue({ success: true } as any);
});

describe('getBiometricCapability', () => {
  test('available + Face ID label when hardware, enrolled, facial type (iOS)', async () => {
    mocked.hasHardwareAsync.mockResolvedValue(true);
    mocked.isEnrolledAsync.mockResolvedValue(true);
    mocked.supportedAuthenticationTypesAsync.mockResolvedValue([LA.AuthenticationType.FACIAL_RECOGNITION]);
    const cap = await getBiometricCapability();
    expect(cap).toEqual({ available: true, label: 'Face ID' });
  });

  test('Touch ID label for fingerprint on iOS', async () => {
    mocked.hasHardwareAsync.mockResolvedValue(true);
    mocked.isEnrolledAsync.mockResolvedValue(true);
    mocked.supportedAuthenticationTypesAsync.mockResolvedValue([LA.AuthenticationType.FINGERPRINT]);
    const cap = await getBiometricCapability();
    expect(cap.label).toBe('Touch ID');
  });

  test('not available when no hardware', async () => {
    mocked.hasHardwareAsync.mockResolvedValue(false);
    mocked.isEnrolledAsync.mockResolvedValue(true);
    const cap = await getBiometricCapability();
    expect(cap.available).toBe(false);
  });

  test('not available when hardware present but user not enrolled', async () => {
    mocked.hasHardwareAsync.mockResolvedValue(true);
    mocked.isEnrolledAsync.mockResolvedValue(false);
    const cap = await getBiometricCapability();
    expect(cap.available).toBe(false);
  });
});

describe('promptBiometric', () => {
  test('returns true on success', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: true } as any);
    expect(await promptBiometric('Confirm')).toBe(true);
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Confirm' }),
    );
  });
  test('returns false on cancel/failure', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: false } as any);
    expect(await promptBiometric('Confirm')).toBe(false);
  });
  test('returns false when authenticateAsync throws', async () => {
    mocked.authenticateAsync.mockRejectedValue(new Error('boom'));
    expect(await promptBiometric('Confirm')).toBe(false);
  });
});
