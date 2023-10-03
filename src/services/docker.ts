import { WorkspaceContext } from '@causa/workspace';
import { Logger } from 'pino';
import { DockerConfiguration } from '../configurations/index.js';
import {
  ProcessService,
  ProcessServiceExitCodeError,
  SpawnOptions,
  SpawnedProcessResult,
} from './process.js';

/**
 * Defines a mount on a Docker container, i.e. a `--mount` option.
 */
export type DockerContainerMount = {
  /**
   * The type of mount. Use `bind` to expose the local file system.
   */
  type: 'bind' | 'volume' | 'tmpfs';

  /**
   * The source for the mount, e.g. the path to the local file or directory to expose.
   */
  source?: string;

  /**
   * The path within the container.
   */
  destination: string;

  /**
   * Whether the mount is readonly in the container.
   */
  readonly?: boolean;
};

/**
 * Defines a port to expose outside a Docker container.
 */
export type DockerContainerPublish = {
  /**
   * The host / interface listening for connections.
   * Use `127.0.0.1` to make the port available only to the local computer.
   * Use `0.0.0.0` to allow any outside connection.
   */
  host?: string;

  /**
   * The number of the port on the local computer.
   */
  local: number;

  /**
   * The number of the port within the container.
   */
  container: number;

  /**
   * The used protocol.
   * Defaults to `tcp`.
   */
  protocol?: 'tcp' | 'udp' | 'sctp';
};

/**
 * A service exposing the Docker CLI.
 */
export class DockerService {
  /**
   * The underlying {@link ProcessService} spawning the Docker CLI.
   */
  private readonly processService: ProcessService;

  /**
   * The logger to use.
   */
  private readonly logger: Logger;

  /**
   * The name of the Docker network specific to the workspace.
   * Call {@link DockerService.createNetworkIfNeeded} to ensure it exists.
   */
  readonly networkName: string;

  constructor(context: WorkspaceContext) {
    this.processService = context.service(ProcessService);
    this.logger = context.logger;

    const dockerConf = context.asConfiguration<DockerConfiguration>();
    this.networkName =
      dockerConf.get('docker.network.name') ??
      dockerConf.getOrThrow('workspace.name');
  }

  /**
   * Builds a Docker image.
   *
   * @param path The path to the directory used for the Docker context.
   * @param options Additional build options.
   */
  async build(
    path: string,
    options: {
      /**
       * The path to the Dockerfile.
       */
      file?: string;

      /**
       * The platform for which the image should be built (e.g. `linux/amd64`).
       */
      platform?: string;

      /**
       * Build arguments passed to the Dockerfile.
       * Setting the value of an argument as `undefined` will instead forward the current value of the corresponding
       * environment variable.
       */
      buildArgs?: Record<string, string | undefined>;

      /**
       * Secrets passed to the Dockerfile.
       * Keys are secret IDs and must be provided, contrary to the Docker command line.
       */
      secrets?: Record<
        string,
        | {
            /**
             * The secret filename.
             */
            source: string;
          }
        | {
            /**
             * The secret environment variable.
             */
            env: string;
          }
      >;

      /**
       * A list of tags to assign to the image.
       */
      tags?: string[];
    } & Pick<SpawnOptions, 'logging' | 'environment'> = {},
  ): Promise<SpawnedProcessResult> {
    const args: string[] = [];

    if (options.file) {
      args.push('--file', options.file);
    }

    if (options.platform) {
      args.push('--platform', options.platform);
    }

    if (options.tags) {
      args.push(...options.tags.flatMap((t) => ['--tag', t]));
    }

    if (options.buildArgs) {
      args.push(
        ...Object.entries(options.buildArgs).flatMap(([key, value]) => [
          '--build-arg',
          value === undefined ? key : `${key}=${value}`,
        ]),
      );
    }

    if (options.secrets) {
      args.push(
        ...Object.entries(options.secrets).flatMap(([id, secret]) => {
          return [
            '--secret',
            'source' in secret
              ? `id=${id},source=${secret.source}`
              : `id=${id},env=${secret.env}`,
          ];
        }),
      );
    }

    return await this.docker('build', [...args, path], {
      logging: options.logging,
      environment: options.environment,
    });
  }

  /**
   * Assigns a new tag to an existing local image.
   *
   * @param sourceImage The image to which a new tag should be assigned.
   * @param targetImage The new tag.
   * @param options Additional options.
   */
  async tag(
    sourceImage: string,
    targetImage: string,
    options: Pick<SpawnOptions, 'logging'> = {},
  ): Promise<SpawnedProcessResult> {
    return await this.docker('tag', [sourceImage, targetImage], options);
  }

  /**
   * Pushes a local image to a remote repository.
   *
   * @param name The name/tag of the image to push.
   * @param options Additional options.
   */
  async push(
    name: string,
    options: Pick<SpawnOptions, 'logging'> = {},
  ): Promise<SpawnedProcessResult> {
    return await this.docker('push', [name], options);
  }

  /**
   * "Inspects" the given image, returning the parsed manifest.
   * This is an experimental feature.
   *
   * @param name The name of the image to inspect.
   * @param options Additional options.
   * @returns The parsed manifest as an object.
   */
  async manifestInspect(
    name: string,
    options: Pick<SpawnOptions, 'logging'> = {},
  ): Promise<any> {
    const result = await this.docker('manifest', ['inspect', name], {
      capture: { stdout: true },
      logging: options.logging ?? null,
    });
    const json = result.stdout ?? '{}';
    return JSON.parse(json);
  }

  /**
   * Checks whether a (possibly remote) image exists.
   * This uses the {@link DockerService.manifestInspect} method, which is experimental.
   *
   * @param name The name of the image.
   * @returns `true` if the image exists.
   */
  async exists(name: string): Promise<boolean> {
    try {
      await this.manifestInspect(name, { logging: null });
      return true;
    } catch (error) {
      if (
        error instanceof ProcessServiceExitCodeError &&
        error.result.code === 1
      ) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Deletes the given containers.
   *
   * @param containers The list of containers to remove.
   * @param options Options when removing the containers.
   */
  async rm(
    containers: string[],
    options: {
      /**
       * Forces the removal if the containers are running.
       */
      force?: boolean;

      /**
       * Removes anonymous volumes.
       */
      volumes?: boolean;
    } & SpawnOptions = {},
  ): Promise<void> {
    const { force, volumes, ...spawnOptions } = options;

    const args = [...containers];

    if (force) {
      args.splice(0, 0, '--force');
    }

    if (volumes) {
      args.splice(0, 0, '--volumes');
    }

    await this.docker('rm', args, spawnOptions);
  }

  /**
   * Creates a new container and runs a command within it.
   *
   * @param image The Docker image used to create the container.
   * @param options Options when running the container.
   * @returns The result of the Docker command.
   */
  async run(
    image: string,
    options: {
      /**
       * The name of the container.
       */
      name?: string;

      /**
       * The command and arguments to pass to the container.
       */
      commandAndArgs?: string[];

      /**
       * Runs the container in the background.
       */
      detach?: boolean;

      /**
       * Sets the working directory within the container.
       */
      workdir?: string;

      /**
       * The list of filesystem mounts to attach to the container.
       */
      mounts?: DockerContainerMount[];

      /**
       * The list of ports to publish.
       */
      publish?: DockerContainerPublish[];

      /**
       * A map containing environment variable names and values. If the value is `undefined`, the current environment
       * variable value is passed.
       */
      env?: Record<string, string | undefined>;

      /**
       * The path to a file containing environment variables to pass to the container.
       */
      envFile?: string;

      /**
       * Automatically removes the container when it exits.
       */
      rm?: boolean;

      /**
       * The network in which the container should be run.
       */
      network?: string;
    } & SpawnOptions = {},
  ): Promise<SpawnedProcessResult> {
    const {
      commandAndArgs,
      rm,
      workdir,
      mounts,
      env,
      envFile,
      name,
      detach,
      publish,
      network,
      ...spawnOptions
    } = options;
    const args = [image, ...(commandAndArgs ?? [])];

    if (workdir !== undefined) {
      args.splice(0, 0, '--workdir', workdir);
    }

    (mounts ?? []).forEach((m) => {
      let mountArg = `type=${m.type},destination=${m.destination}`;
      if (m.source) {
        mountArg += `,source=${m.source}`;
      }
      if (m.readonly) {
        mountArg += ',readonly';
      }
      args.splice(0, 0, '--mount', mountArg);
    });

    Object.entries(env ?? {}).forEach(([varName, varValue]) => {
      let envArg = varName;
      if (varValue !== undefined) {
        envArg += `=${varValue}`;
      }
      args.splice(0, 0, '--env', envArg);
    });

    if (envFile) {
      args.splice(0, 0, '--env-file', envFile);
    }

    if (rm) {
      args.splice(0, 0, '--rm');
    }

    if (name) {
      args.splice(0, 0, '--name', name);
    }

    if (detach) {
      args.splice(0, 0, '--detach');
    }

    if (network) {
      args.splice(0, 0, '--network', network);
    }

    (publish ?? []).forEach(({ host, local, container, protocol }) => {
      let arg = `${local}:${container}`;
      if (host) {
        arg = `${host}:${arg}`;
      }
      if (protocol) {
        arg = `${arg}/${protocol}`;
      }
      args.splice(0, 0, '--publish', arg);
    });

    return await this.docker('run', args, spawnOptions);
  }

  /**
   * Creates a new Docker network.
   *
   * @param network The name of the network to create.
   * @param options Options when creating the network.
   */
  async networkCreate(
    network: string,
    options: SpawnOptions = {},
  ): Promise<void> {
    await this.docker('network', ['create', network], options);
  }

  /**
   * Lists the available Docker networks.
   *
   * @param options Options when listing the networks.
   * @returns The result of the spawned process.
   */
  async networkLs(
    options: {
      /**
       * A filter to apply to the results before returning them.
       */
      filter?: string;

      /**
       * When `true`, only network IDs will be returned.
       */
      quiet?: boolean;
    } & SpawnOptions = {},
  ): Promise<SpawnedProcessResult> {
    const { filter, quiet, ...spawnOptions } = options;
    const args = ['ls'];

    if (filter) {
      args.push('--filter', filter);
    }

    if (quiet) {
      args.push('--quiet');
    }

    return await this.docker('network', args, {
      capture: { stdout: true, stderr: true },
      ...spawnOptions,
    });
  }

  /**
   * The promise created the first time {@link DockerService.createNetworkIfNeeded} is called.
   * Resolves when the network has been created or when its existence has been checked.
   */
  private createNetworkPromise: Promise<string> | undefined;

  /**
   * Creates the Docker network that should be used for containers related to the workspace.
   * The name of the network is {@link DockerService.networkName}.
   *
   * @returns The name of the network.
   */
  async createNetworkIfNeeded(): Promise<string> {
    if (!this.createNetworkPromise) {
      const { networkName, logger } = this;
      this.createNetworkPromise = (async () => {
        try {
          logger.debug(`🐳 Creating Docker network '${networkName}'.`);
          await this.networkCreate(networkName);
          return networkName;
        } catch (error) {
          if (error instanceof ProcessServiceExitCodeError) {
            // The create operation might fail because the network already exists.
            const { stdout } = await this.networkLs({
              filter: `name=${networkName}`,
              quiet: true,
            });
            // A non-empty output means the already-existing network ID has been returned.
            if (stdout?.trim()) {
              return networkName;
            }
          }

          throw error;
        }
      })();
    }

    return await this.createNetworkPromise;
  }

  /**
   * Runs an arbitrary Docker CLI command.
   *
   * @param command The command to run.
   * @param args Additional arguments that will be appended to the command.
   * @param options Options when spawning the Docker CLI process.
   * @returns The result of the spawned process.
   */
  async docker(
    command: string,
    args: string[],
    options: SpawnOptions = {},
  ): Promise<SpawnedProcessResult> {
    const process = this.processService.spawn(
      'docker',
      [command, ...args],
      options,
    );
    return await process.result;
  }
}
