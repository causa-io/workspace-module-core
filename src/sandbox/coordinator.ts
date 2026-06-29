import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime';
import { mergeSandboxEnvironment } from './environment.js';

/**
 * An error thrown when sandboxing is requested but the current environment cannot support it (unsupported platform, or
 * missing OS dependencies).
 */
export class SandboxNotSupportedError extends Error {}

/**
 * A sandboxed command prepared by {@link SandboxCoordinator.acquire}, ready to be spawned.
 */
export type AcquiredSandboxCommand = {
  /**
   * The sandbox-wrapped argv to spawn.
   */
  readonly argv: string[];

  /**
   * The environment to spawn the command with: the caller's environment merged with the one the sandbox requires.
   */
  readonly environment: Record<string, string | undefined>;

  /**
   * Tears the sandbox down and releases the serialization lock so the next command can run.
   * Must be called (and awaited) once the command has finished (or failed to start). Idempotent.
   */
  readonly release: () => Promise<void>;
};

/**
 * Coordinates access to the process-wide `SandboxManager` singleton.
 *
 * The sandbox runtime exposes a single manager per process, so sandboxed commands are run strictly one at a time: each
 * command initializes the manager with its own configuration, runs, then tears it down on release.
 */
export class SandboxCoordinator {
  /**
   * Whether the platform/dependency support check has already passed.
   */
  private supportChecked = false;

  /**
   * The tail of the serialization chain: a promise that resolves once the currently-running command releases.
   * The next {@link SandboxCoordinator.acquire} awaits it before running, ensuring commands run one at a time.
   */
  private tail: Promise<void> = Promise.resolve();

  /**
   * Acquires the exclusive right to run a sandboxed command and prepares it: waits for the previous command to release,
   * initializes the manager with the configuration, and wraps the command for execution inside the sandbox. The
   * returned argv and environment are ready to be spawned.
   *
   * Each successful call returns a `release` function that must be called and awaited once the command has finished
   * (or failed to start) to tear the sandbox down and let the next command run.
   *
   * @param config The configuration the command requires.
   * @param command The command to run.
   * @param args The arguments to pass to the command.
   * @param environment The caller's environment, merged with the one the sandbox requires.
   * @returns The sandbox-wrapped argv, the environment to spawn it with, and the `release` function.
   */
  async acquire(
    config: SandboxRuntimeConfig,
    command: string,
    args: string[],
    environment: Record<string, string | undefined> | undefined,
  ): Promise<AcquiredSandboxCommand> {
    this.ensureSupported();

    const release = await this.lock();

    try {
      await SandboxManager.initialize(config);

      const commandString = [command, ...args]
        .map((token) => `'${token.replaceAll("'", `'\\''`)}'`)
        .join(' ');
      const { argv, env: sbxEnv } = await SandboxManager.wrapWithSandboxArgv(
        commandString,
        undefined,
        // Credentials are masked by the coordinator, so they are stripped from the configuration.
        { ...config, credentials: {} },
      );

      const env = mergeSandboxEnvironment(environment, sbxEnv);
      this.applyCredentials(config, environment, env);

      return { argv, environment: env, release };
    } catch (error) {
      await release();
      throw error;
    }
  }

  /**
   * Applies the profile's declared credential environment variables to the child's environment in place:
   *
   * - `mask`: the real value is read from the spawning process (the caller's `environment`, falling back to
   *   `process.env`), registered under a per-session sentinel, and substituted for the sentinel in the child's
   *   environment. The runtime's own masking reads `process.env` only, so it cannot see values passed through
   *   `environment`. The coordinator masks them here instead.
   * - `deny`: the variable is removed from the child's environment.
   *
   * @param config The configuration whose credentials declare the variables to apply.
   * @param callerEnvironment The caller's environment, the primary source of the real values.
   * @param environment The environment to spawn the command with, mutated in place.
   */
  private applyCredentials(
    config: SandboxRuntimeConfig,
    callerEnvironment: Record<string, string | undefined> | undefined,
    environment: Record<string, string | undefined>,
  ): void {
    const registry = SandboxManager.getSentinelRegistry();
    for (const { name, mode, injectHosts } of config.credentials?.envVars ??
      []) {
      if (mode === 'deny') {
        delete environment[name];
        continue;
      }

      const real = callerEnvironment?.[name] ?? process.env[name];
      if (real !== undefined) {
        environment[name] = registry.register(name, real, injectHosts ?? []);
      }
    }
  }

  /**
   * Takes the serialization lock, resolving once the previously-acquired command has released.
   *
   * @returns An idempotent `release` function that tears the manager down and frees the lock so the next holder can
   *   proceed.
   */
  private async lock(): Promise<() => Promise<void>> {
    const previous = this.tail;
    let releaseLock!: () => void;
    this.tail = new Promise<void>((resolve) => (releaseLock = resolve));
    await previous;

    let released = false;
    return async () => {
      if (released) {
        return;
      }
      released = true;

      try {
        SandboxManager.getSentinelRegistry().clear();
        await SandboxManager.reset();
      } finally {
        releaseLock();
      }
    };
  }

  /**
   * Checks (once) that the current platform supports sandboxing and that the required OS dependencies are present.
   *
   * @throws {SandboxNotSupportedError} If the platform is unsupported or dependencies are missing.
   */
  private ensureSupported(): void {
    if (this.supportChecked) {
      return;
    }

    if (!SandboxManager.isSupportedPlatform()) {
      throw new SandboxNotSupportedError(
        'Sandboxing is not supported on this platform.',
      );
    }

    const { errors } = SandboxManager.checkDependencies();
    if (errors.length > 0) {
      throw new SandboxNotSupportedError(
        `Sandboxing dependencies are missing: ${errors.join(', ')}.`,
      );
    }

    this.supportChecked = true;
  }
}

/**
 * The process-global {@link SandboxCoordinator} shared by all {@link ProcessService} instances (across contexts).
 */
export const sandboxCoordinator = new SandboxCoordinator();
