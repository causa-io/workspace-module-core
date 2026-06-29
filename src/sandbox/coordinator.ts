import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime';
import { isDeepStrictEqual } from 'util';
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
   * Cleans up the command's per-command artifacts and releases the serialization lock so the next command can run.
   * Must be called once the command has finished (or failed to start). Idempotent.
   */
  readonly release: () => void;
};

/**
 * Coordinates access to the process-wide `SandboxManager` singleton.
 *
 * The sandbox runtime exposes a single manager per process.
 * Sandboxed commands are therefore run strictly one at a time. As the only optimization, the global configuration is
 * reused as-is (not re-applied) when a command requests the exact same one as the previous command.
 *
 * Teardown is handled by the sandbox runtime itself: `SandboxManager.initialize()` registers `exit`/`SIGINT`/`SIGTERM`
 * handlers that call its own `reset()`.
 */
export class SandboxCoordinator {
  /**
   * The configuration currently applied to the manager, or `undefined` if none has been applied yet.
   */
  private activeConfig: SandboxRuntimeConfig | undefined;

  /**
   * Whether `SandboxManager.initialize()` has been called (and the proxies started) in this process.
   */
  private initialized = false;

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
   * applies the configuration, and wraps the command for execution inside the sandbox. The returned argv and
   * environment are ready to be spawned.
   *
   * Each successful call returns a `release` function that must be called once the command has finished (or failed to
   * start) to clean up its per-command artifacts and let the next command run.
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

    const releaseLock = await this.lock();

    try {
      await this.applyConfig(config);

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

      const release = this.makeRelease(releaseLock);
      return { argv, environment: env, release };
    } catch (error) {
      releaseLock();
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
   * Builds the `release` function returned by {@link SandboxCoordinator.acquire}. It cleans up the per-command sandbox
   * artifacts (e.g. Linux bwrap mount points) and frees the serialization lock. It is idempotent.
   *
   * @param releaseLock The function freeing the serialization lock.
   * @returns The `release` function.
   */
  private makeRelease(releaseLock: () => void): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;

      SandboxManager.cleanupAfterCommand();
      SandboxManager.getSentinelRegistry().clear();
      releaseLock();
    };
  }

  /**
   * Takes the serialization lock, resolving once the previous holder (a command or a {@link SandboxCoordinator.reset})
   * has released. The returned function must be called to release the lock and let the next holder proceed.
   *
   * @returns The function releasing the lock.
   */
  private async lock(): Promise<() => void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await previous;
    return release;
  }

  /**
   * Applies a configuration to the manager.
   *
   * - Identical to the active one: reused as-is.
   * - Differing only in the live-updatable network allow/deny lists: applied with `updateConfig`.
   * - Differing in an initialization-fixed field (e.g. TLS termination): the manager is torn down and re-initialized.
   *
   * @param config The configuration to apply.
   */
  private async applyConfig(config: SandboxRuntimeConfig): Promise<void> {
    const active = this.activeConfig;
    if (this.initialized && active) {
      if (isDeepStrictEqual(config, active)) {
        return;
      }

      // Only the network allow/deny lists are live-updatable. `tlsTerminate` (the mitm CA) and the presence of
      // `credentials` (which wires the credential injector) are fixed at initialization, so a change in either requires
      // tearing the manager down.
      const requiresReinitialization =
        (config.credentials === undefined) !==
          (active.credentials === undefined) ||
        !isDeepStrictEqual(
          config.network.tlsTerminate,
          active.network.tlsTerminate,
        );

      if (!requiresReinitialization) {
        SandboxManager.updateConfig(config);
        this.activeConfig = config;
        return;
      }

      await SandboxManager.reset();
      this.initialized = false;
    }

    await SandboxManager.initialize(config);
    this.initialized = true;
    this.activeConfig = config;
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

  /**
   * Tears down the manager and resets the coordinator's state.
   * Mostly useful for tests and explicit shutdowns. In normal CLI usage the sandbox runtime resets itself on process
   * exit.
   */
  async reset(): Promise<void> {
    const release = await this.lock();

    try {
      this.activeConfig = undefined;
      this.initialized = false;
      this.supportChecked = false;

      await SandboxManager.reset();
    } finally {
      release();
    }
  }
}

/**
 * The process-global {@link SandboxCoordinator} shared by all {@link ProcessService} instances (across contexts).
 */
export const sandboxCoordinator = new SandboxCoordinator();
