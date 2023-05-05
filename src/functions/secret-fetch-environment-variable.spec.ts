import {
  InvalidSecretDefinitionError,
  SecretValueNotFoundError,
} from '@causa/workspace';
import 'jest-extended';
import { createFunction } from '../utils.test.js';
import { SecretFetchForEnvironmentVariable } from './secret-fetch-environment-variable.js';

describe('SecretFetchForEnvironmentVariable', () => {
  let initialEnv: Record<string, string | undefined>;

  beforeEach(() => {
    initialEnv = process.env;
  });

  afterEach(() => {
    process.env = initialEnv;
  });

  it('should support the environmentVariable backend', () => {
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: 'environmentVariable',
      configuration: {},
    });

    const actualSupports = fn._supports();

    expect(actualSupports).toBeTrue();
  });

  it('should not support a backend other than environmentVariable', () => {
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: '🌧️',
      configuration: {},
    });

    const actualSupports = fn._supports();

    expect(actualSupports).toBeFalse();
  });

  it('should throw an error when the name does not exist in the configuration', async () => {
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: 'environmentVariable',
      configuration: {},
    });

    const actualPromise = fn._call();

    await expect(actualPromise).rejects.toThrow(InvalidSecretDefinitionError);
  });

  it('should throw an error when the name is not a string', async () => {
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: 'environmentVariable',
      configuration: { name: 123 },
    });

    const actualPromise = fn._call();

    await expect(actualPromise).rejects.toThrow(InvalidSecretDefinitionError);
  });

  it('should throw an error when the environment variable is not set', async () => {
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: 'environmentVariable',
      configuration: { name: 'NOT_FOUND' },
    });

    const actualPromise = fn._call();

    await expect(actualPromise).rejects.toThrow(SecretValueNotFoundError);
  });

  it('should return the environment variable', async () => {
    process.env.MY_ENV_VAR = '🌻';
    const fn = createFunction(SecretFetchForEnvironmentVariable, {
      backend: 'environmentVariable',
      configuration: { name: 'MY_ENV_VAR' },
    });

    const actualSecret = await fn._call();

    expect(actualSecret).toEqual('🌻');
  });
});
