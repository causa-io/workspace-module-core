import {
  InvalidSecretDefinitionError,
  SecretFetch,
  SecretValueNotFoundError,
} from '@causa/workspace';

/**
 * Implements {@link SecretFetch} resolving secrets as environment variables.
 * The backend ID is `environmentVariable`, and the secret's configuration should set name of the environment variable
 * to read:
 *
 * ```yaml
 * secrets:
 *   mySecret:
 *     backend: environmentVariable
 *     name: SOME_ENV_VAR
 * ```
 */
export class SecretFetchForEnvironmentVariable extends SecretFetch {
  async _call(): Promise<string> {
    const name = this.configuration.name as string | undefined;
    if (!name || typeof name !== 'string') {
      throw new InvalidSecretDefinitionError(
        `Missing 'name' field that should reference the secret.`,
      );
    }

    const value = process.env[name];
    if (value === undefined) {
      throw new SecretValueNotFoundError(
        `Secret environment variable with name '${name}' is not set.`,
      );
    }

    return value;
  }

  _supports(): boolean {
    return this.backend === 'environmentVariable';
  }
}
