const fs = require('node:fs');
const path = require('node:path');
const nextJest = require('next/jest.js');

const rootDir = __dirname;
const sourceRoot = path.join(rootDir, 'src');

function getApplicationFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return getApplicationFiles(fullPath);
    }

    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

const fileThresholds = Object.fromEntries(
  getApplicationFiles(sourceRoot).map((filePath) => [
    filePath,
    { branches: 90, functions: 90, lines: 90, statements: 90 },
  ]),
);

const createJestConfig = nextJest({ dir: rootDir });

module.exports = createJestConfig({
  rootDir,
  testEnvironment: 'node',
  testTimeout: 30_000,
  testMatch: ['<rootDir>/unit-tests/**/*.test.ts', '<rootDir>/unit-tests/**/*.test.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: {
    '^@prisma/client-worker$': '<rootDir>/generated/prisma/client.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/unit-tests/jest.setup.ts'],
  coverageProvider: 'v8',
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}'],
  coverageDirectory: '<rootDir>/coverage/unit',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json', 'json-summary'],
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
    ...fileThresholds,
  },
});
