import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricCapability = { available: boolean; label: string };

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const available = hasHardware && enrolled;

  let label = 'biometrics';
  if (available) {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasPrint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    if (Platform.OS === 'ios') {
      label = hasFace ? 'Face ID' : hasPrint ? 'Touch ID' : 'biometrics';
    } else {
      label = 'biometrics';
    }
  }
  return { available, label };
}

export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
