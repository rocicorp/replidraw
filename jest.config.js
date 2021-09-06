module.exports = {
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
    '!**/replicache/**',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
}
