import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@validators/(.*)$': '<rootDir>/src/validators/$1',
    '^@signing/(.*)$': '<rootDir>/src/signing/$1',
    '^@cufe/(.*)$': '<rootDir>/src/cufe/$1',
    '^@dgi/(.*)$': '<rootDir>/src/dgi/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
  },
};

export default config;
