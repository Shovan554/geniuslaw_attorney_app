import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

const ACCESS_KEY = 'gla_access_token';
const REFRESH_KEY = 'gla_refresh_token';
const TEMP_2FA_KEY = 'gla_temp_2fa_token';
const USER_KEY = 'gla_user';

const BIO_ENABLED_KEY = 'gla_biometric_enabled';
const BIO_USER_KEY = 'gla_biometric_user';
const BIO_REFRESH_KEY = 'gla_biometric_refresh';

export type PublicUser = {
  id: number;
  email: string;
  role: 'attorney' | 'admin' | 'staff' | 'accounting' | 'client';
  firm_id: number | null;
  attorney_id: number | null;
  full_name: string | null;
  initials: string | null;
};

export type AuthResult =
  | { status: 'success'; user: PublicUser; mustChangePassword: boolean }
  | { status: 'requires_2fa' }
  | { status: 'error'; message: string };

async function postJson<T>(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = json?.detail;
      let message: string;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail) && detail[0]?.msg) {
        message = String(detail[0].msg);
      } else {
        message = `Request failed (${res.status})`;
      }
      return { ok: false, message, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Network error', status: 0 };
  }
}

type LoginResponse = {
  requires_2fa: boolean;
  must_change_password?: boolean;
  temp_token?: string;
  access_token?: string;
  refresh_token?: string;
  user?: PublicUser;
};

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const res = await postJson<LoginResponse>('/auth/login', {
    email: email.trim().toLowerCase(),
    password,
  });
  if (!res.ok) return { status: 'error', message: res.message };

  if (res.data.requires_2fa && res.data.temp_token) {
    await SecureStore.setItemAsync(TEMP_2FA_KEY, res.data.temp_token);
    return { status: 'requires_2fa' };
  }

  if (res.data.access_token && res.data.refresh_token && res.data.user) {
    await SecureStore.setItemAsync(ACCESS_KEY, res.data.access_token);
    await SecureStore.setItemAsync(REFRESH_KEY, res.data.refresh_token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.data.user));
    return {
      status: 'success',
      user: res.data.user,
      mustChangePassword: !!res.data.must_change_password,
    };
  }

  return { status: 'error', message: 'Malformed login response.' };
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
  must_change_password?: boolean;
};

export async function verifyTotp(code: string): Promise<AuthResult> {
  const tempToken = await SecureStore.getItemAsync(TEMP_2FA_KEY);
  if (!tempToken) {
    return { status: 'error', message: 'Session expired. Please sign in again.' };
  }
  const res = await postJson<TokenResponse>('/auth/2fa/verify', {
    temp_token: tempToken,
    totp_code: code,
  });
  if (!res.ok) return { status: 'error', message: res.message };

  await SecureStore.setItemAsync(ACCESS_KEY, res.data.access_token);
  await SecureStore.setItemAsync(REFRESH_KEY, res.data.refresh_token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.data.user));
  await SecureStore.deleteItemAsync(TEMP_2FA_KEY);
  return {
    status: 'success',
    user: res.data.user,
    mustChangePassword: !!res.data.must_change_password,
  };
}

let _refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) return null;
      const res = await postJson<{ access_token: string }>('/auth/refresh', {
        refresh_token: refreshToken,
      });
      if (!res.ok) return null;
      await SecureStore.setItemAsync(ACCESS_KEY, res.data.access_token);
      return res.data.access_token;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  let token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (!token) return null;

  const buildHeaders = (t: string): HeadersInit => ({
    ...(init.headers ?? {}),
    Authorization: `Bearer ${t}`,
  });

  let res = await fetch(`${API_URL}${path}`, { ...init, headers: buildHeaders(token) });
  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed) return res;

  res = await fetch(`${API_URL}${path}`, { ...init, headers: buildHeaders(refreshed) });
  return res;
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(TEMP_2FA_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getStoredUser(): Promise<PublicUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export async function getUserId(): Promise<number | null> {
  const user = await getStoredUser();
  return user?.id ?? null;
}

export async function getAttorneyId(): Promise<number | null> {
  const user = await getStoredUser();
  return user?.attorney_id ?? null;
}

export async function hasSession(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(ACCESS_KEY);
  return !!token;
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(BIO_ENABLED_KEY);
  return v === 'true';
}

export async function getBiometricUser(): Promise<PublicUser | null> {
  const raw = await SecureStore.getItemAsync(BIO_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

/** Snapshot the current session's refresh token + user behind the biometric flag. */
export async function enableBiometric(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  const user = await SecureStore.getItemAsync(USER_KEY);
  if (!refresh || !user) return false;
  await SecureStore.setItemAsync(BIO_REFRESH_KEY, refresh);
  await SecureStore.setItemAsync(BIO_USER_KEY, user);
  await SecureStore.setItemAsync(BIO_ENABLED_KEY, 'true');
  return true;
}

export async function disableBiometric(): Promise<void> {
  await SecureStore.deleteItemAsync(BIO_ENABLED_KEY);
  await SecureStore.deleteItemAsync(BIO_USER_KEY);
  await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
}

/** Mint a fresh session from the biometric-stored refresh token. Caller gates with promptBiometric() first. */
export async function biometricLogin(): Promise<AuthResult> {
  const refresh = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
  const userRaw = await SecureStore.getItemAsync(BIO_USER_KEY);
  if (!refresh || !userRaw) {
    return { status: 'error', message: 'Face ID sign-in is not set up on this device.' };
  }

  const res = await postJson<{ access_token: string }>('/auth/refresh', { refresh_token: refresh });
  if (!res.ok) {
    await disableBiometric();
    return { status: 'error', message: 'Your session expired. Please sign in with your password.' };
  }

  let user: PublicUser;
  try {
    user = JSON.parse(userRaw) as PublicUser;
  } catch {
    await disableBiometric();
    return { status: 'error', message: 'Saved sign-in data was corrupted. Please sign in with your password.' };
  }

  await SecureStore.setItemAsync(ACCESS_KEY, res.data.access_token);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  await SecureStore.setItemAsync(USER_KEY, userRaw);
  return { status: 'success', user, mustChangePassword: false };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await authedFetch('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res) return { ok: false, message: 'Not signed in.' };
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const detail = json?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg)
          : `Request failed (${res.status})`;
    return { ok: false, message };
  }
  return { ok: true };
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await postJson<{ success: boolean; message: string }>(
    '/auth/forgot-password',
    { email: email.trim().toLowerCase() },
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export async function verifyResetOtp(
  email: string,
  otpCode: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await postJson<{ success: boolean }>('/auth/verify-otp', {
    email: email.trim().toLowerCase(),
    otp_code: otpCode,
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export async function resetPassword(
  email: string,
  otpCode: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await postJson<{ success: boolean }>('/auth/reset-password', {
    email: email.trim().toLowerCase(),
    otp_code: otpCode,
    new_password: newPassword,
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}
