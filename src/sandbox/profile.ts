import {
  SandboxRuntimeConfigSchema,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime';
import { WorkspaceContext } from '@causa/workspace';
import type { CausaConfiguration } from '../configurations/index.js';

/**
 * An error thrown when a referenced sandbox profile is not configured.
 */
export class SandboxProfileNotFoundError extends Error {
  constructor(readonly key: string) {
    super(
      `No sandbox profile is configured for key '${key}' under 'causa.sandboxes'.`,
    );
  }
}

/**
 * An error thrown when a sandbox profile fails validation against the sandbox runtime's schema.
 */
export class InvalidSandboxProfileError extends Error {
  constructor(
    readonly key: string,
    cause: unknown,
  ) {
    super(
      `Invalid sandbox profile '${key}': ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/**
 * Resolves a sandbox profile referenced by key against the given context, into a full sandbox runtime configuration.
 *
 * @param context The {@link WorkspaceContext} from which the configuration and workspace root are read.
 * @param key The key of the profile to resolve.
 * @returns The resolved {@link SandboxRuntimeConfig}.
 * @throws {SandboxProfileNotFoundError} If no profile is configured for the given key.
 * @throws {InvalidSandboxProfileError} If the profile fails validation against the sandbox runtime's schema.
 */
export function resolveSandboxProfile(
  context: WorkspaceContext,
  key: string,
): SandboxRuntimeConfig {
  const profile = context
    .asConfiguration<CausaConfiguration>()
    .get(`causa.sandboxes.${key}`);
  if (!profile) {
    throw new SandboxProfileNotFoundError(key);
  }

  const rootPath = context.rootPath;

  const envVars = Object.entries(profile.credentials?.environment ?? {}).map(
    ([name, { hosts: injectHosts }]) =>
      injectHosts.length > 0
        ? ({ name, mode: 'mask', injectHosts } as const)
        : ({ name, mode: 'deny' } as const),
  );
  const hasMaskedCredentials = envVars.some((v) => v.mode === 'mask');

  // The workspace root is auto-injected so the spawned process can read and write the project it operates on, and the
  // home directory (`~`) is denied for reads to keep unrelated secrets (SSH keys, other projects, credentials) out of
  // reach.
  const candidate: SandboxRuntimeConfig = {
    network: {
      allowedDomains: profile.network?.allowedDomains ?? [],
      deniedDomains: profile.network?.deniedDomains ?? [],
      allowLocalBinding: profile.network?.allowLocalBinding,
      allowUnixSockets: profile.network?.allowUnixSockets,
      allowAllUnixSockets: profile.network?.allowAllUnixSockets,
      // Credential masking requires TLS termination so the real value is only substituted over a verified connection.
      // It is enabled automatically (with an ephemeral CA) when the profile declares masked credentials.
      ...(hasMaskedCredentials ? { tlsTerminate: {} } : {}),
    },
    filesystem: {
      denyRead: ['~', ...(profile.filesystem?.denyRead ?? [])],
      allowRead: [rootPath, ...(profile.filesystem?.allowRead ?? [])],
      allowWrite: [rootPath, ...(profile.filesystem?.allowWrite ?? [])],
      denyWrite: [...(profile.filesystem?.denyWrite ?? [])],
      disabled: profile.filesystem?.disabled,
    },
    ...(envVars.length > 0 ? { credentials: { envVars } } : {}),
    enableWeakerNestedSandbox: profile.enableWeakerNestedSandbox,
    enableWeakerNetworkIsolation: profile.enableWeakerNetworkIsolation,
  };

  try {
    return SandboxRuntimeConfigSchema.parse(candidate);
  } catch (error) {
    throw new InvalidSandboxProfileError(key, error);
  }
}
