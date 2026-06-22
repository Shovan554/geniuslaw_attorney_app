module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Only run our own unit tests; keep app-tree/native modules out of scope.
  testMatch: ['<rootDir>/lib/**/__tests__/**/*.test.ts'],
};
