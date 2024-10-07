import {
  type BaseConfiguration,
  InvalidSecretDefinitionError,
  SecretBackendNotFoundError,
  SecretValueNotFoundError,
  WorkspaceContext,
} from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { SecretFetchForEnvironmentVariable } from './fetch-environment-variable.js';

describe('SecretFetchForEnvironmentVariable', () => {
  let initialEnv: Record<string, string | undefined>;

  beforeEach(() => {
    initialEnv = process.env;
  });

  afterEach(() => {
    process.env = initialEnv;
  });

  it('should not support a backend other than environmentVariable', async () => {
    const context = createContextWithSecrets({ mySecret: { backend: '🌧️' } });

    const actualPromise = context.secret('mySecret');

    await expect(actualPromise).rejects.toThrow(SecretBackendNotFoundError);
  });

  it('should throw an error when the name does not exist in the configuration', async () => {
    const context = createContextWithSecrets({
      mySecret: { backend: 'environmentVariable' },
    });

    const actualPromise = context.secret('mySecret');

    await expect(actualPromise).rejects.toThrow(InvalidSecretDefinitionError);
  });

  it('should throw an error when the name is not a string', async () => {
    const context = createContextWithSecrets({
      mySecret: { backend: 'environmentVariable', name: 123 },
    });

    const actualPromise = context.secret('mySecret');

    await expect(actualPromise).rejects.toThrow(InvalidSecretDefinitionError);
  });

  it('should throw an error when the environment variable is not set', async () => {
    const context = createContextWithSecrets({
      mySecret: { backend: 'environmentVariable', name: 'NOT_FOUND' },
    });

    const actualPromise = context.secret('mySecret');

    await expect(actualPromise).rejects.toThrow(SecretValueNotFoundError);
  });

  it('should return the environment variable', async () => {
    process.env.MY_ENV_VAR = '🌻';
    const context = createContextWithSecrets({
      mySecret: { backend: 'environmentVariable', name: 'MY_ENV_VAR' },
    });

    const actualSecret = await context.secret('mySecret');

    expect(actualSecret).toEqual('🌻');
  });

  function createContextWithSecrets(
    secrets: BaseConfiguration['secrets'],
  ): WorkspaceContext {
    return createContext({
      configuration: { workspace: { name: 'test' }, secrets },
      functions: [SecretFetchForEnvironmentVariable],
    }).context;
  }
});
