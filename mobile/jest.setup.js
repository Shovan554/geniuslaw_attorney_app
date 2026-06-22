// In-memory mock for expo-secure-store
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    setItemAsync: jest.fn(async (k, v) => { store.set(k, v); }),
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    deleteItemAsync: jest.fn(async (k) => { store.delete(k); }),
  };
});

// Controllable mock for expo-local-authentication
jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// Reset the secure-store map and all mock fns between tests
beforeEach(() => {
  const ss = require('expo-secure-store');
  ss.__store.clear();
  jest.clearAllMocks();
});
