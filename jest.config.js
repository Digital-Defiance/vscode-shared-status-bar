module.exports = {
  preset: 'ts-jest',
  testMatch: ['**/*.test.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
  },
};
