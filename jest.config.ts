module.exports = {
  // ... other config
  displayName: 'API Tests',
  verbose: false,
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        outputPath: './test-results.html',
        pageTitle: 'Test Report',
        includeFailureMsg: false,
        includeConsoleLog: false,
      },
    ],
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@globals/(.*)$': '<rootDir>/src/globals/$1',
    '^@services/(.*)$': '<rootDir>/src/globals/services/$1',
    // tsconfig baseUrl is "./", so root-relative imports like
    // 'prisma/middleware/...' resolve from the repo root — mirror that here.
    '^prisma/(.*)$': '<rootDir>/prisma/$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
