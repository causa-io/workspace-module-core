import { WorkspaceContext } from '@causa/workspace';
import type { Logger } from 'pino';
import { type DockerContainerPublish, DockerService } from './docker.js';
import { ProcessServiceExitCodeError } from './process.js';

/**
 * The regular expression matching a single host port binding in the `Ports` column of `docker ps`, e.g.
 * `127.0.0.1:8185->8085/tcp` or `[::]:8085->8085/tcp`. The captured group is the host port.
 * Ports that are only exposed by the container, and not bound to a host port, do not match.
 */
const PORT_BINDING_REGEXP = /(?:\[[^\]]+\]|[^\s:,]+):(\d+)->\d+\/\w+/g;

/**
 * A service that can be used to start and stop containerized emulators.
 * The service provides sensible defaults to run the containers, and also provides a method to wait for the emulator to
 * be available.
 */
export class DockerEmulatorService {
  /**
   * The underlying Docker service used to start and stop emulators.
   */
  private readonly dockerService: DockerService;

  /**
   * The logger to use.
   */
  private readonly logger: Logger;

  constructor(context: WorkspaceContext) {
    this.dockerService = context.service(DockerService);
    this.logger = context.logger;
  }

  /**
   * Creates a new Docker container from the given image and starts it in detach mode.
   * This also removes the container with the same name if it already exists.
   * The Docker container is attached to the configured network for the workspace.
   *
   * @param dockerImage The Docker image to run.
   * @param containerName The name of the container to create.
   * @param publish A list of at least one port to expose from the container.
   * @param options Additional Docker run options.
   */
  async start(
    dockerImage: string,
    containerName: string,
    publish: [DockerContainerPublish, ...DockerContainerPublish[]],
    options: Omit<
      NonNullable<Parameters<DockerService['run']>[1]>,
      'name' | 'network' | 'publish'
    > = {},
  ): Promise<void> {
    await this.stop(containerName);

    const network = await this.dockerService.createNetworkIfNeeded();

    this.logger.debug(`🐳 Starting container '${containerName}'.`);
    try {
      await this.dockerService.run(dockerImage, {
        detach: true,
        logging: { stdout: null, stderr: 'debug' },
        capture: { stderr: true },
        pull: 'always',
        ...options,
        name: containerName,
        network,
        publish,
      });
    } catch (error) {
      if (!(error instanceof ProcessServiceExitCodeError)) {
        throw error;
      }

      throw (
        (await this.findPortConflictError(containerName, publish)) ??
        new DockerEmulatorStartError(containerName, error)
      );
    }
  }

  /**
   * Looks for a host port required by the container that is already in use, in order to explain why the container could
   * not be started.
   *
   * @param containerName The name of the container that could not be started.
   * @param publish The list of ports the container tried to publish.
   * @returns The corresponding error, or `null` if no running container publishes any of the host ports.
   */
  private async findPortConflictError(
    containerName: string,
    publish: DockerContainerPublish[],
  ): Promise<DockerEmulatorPortConflictError | null> {
    const containerNamesByPort = await this.getContainerNamesByPublishedPort();

    for (const { local } of publish) {
      const publishingContainerName = containerNamesByPort.get(local);
      if (publishingContainerName !== undefined) {
        return new DockerEmulatorPortConflictError(
          containerName,
          local,
          publishingContainerName,
        );
      }
    }

    return null;
  }

  /**
   * Lists the host ports published by the running Docker containers, along with the container publishing them.
   * If the Docker CLI call fails, an empty map is returned.
   *
   * @returns A map where keys are host ports, and values are the names of the containers publishing them.
   */
  private async getContainerNamesByPublishedPort(): Promise<
    Map<number, string>
  > {
    const containerNamesByPort = new Map<number, string>();

    let stdout: string | undefined;
    try {
      ({ stdout } = await this.dockerService.ps({
        format: '{{.Names}}\t{{.Ports}}',
        logging: null,
      }));
    } catch (error: any) {
      this.logger.debug(
        `🐳 Failed to list the running Docker containers: '${error.message}'.`,
      );
      return containerNamesByPort;
    }

    (stdout ?? '').split('\n').forEach((line) => {
      const [name, ports] = line.split('\t');
      if (!name || !ports) {
        return;
      }

      for (const [, hostPort] of ports.matchAll(PORT_BINDING_REGEXP)) {
        containerNamesByPort.set(parseInt(hostPort), name);
      }
    });

    return containerNamesByPort;
  }

  /**
   * Removes a Docker container running an emulator.
   * This deletes the container whether it is running or not, and will not fail if the container does not exist.
   *
   * @param containerName The name of the container to stop.
   */
  async stop(containerName: string): Promise<void> {
    this.logger.debug(`🐳 Removing Docker container '${containerName}'.`);
    await this.dockerService.rm([containerName], {
      force: true,
      volumes: true,
      logging: null,
    });
  }

  /**
   * Waits for an emulator to be available by repeatedly querying the given endpoint.
   *
   * @param emulatorName The name of the emulator to wait for.
   * @param endpoint The URL to the endpoint that should be queried.
   * @param options Additional options, like retries.
   */
  async waitForAvailability(
    emulatorName: string,
    endpoint: string,
    options: {
      /**
       * The maximum number of queries after which the emulator will be considered to have failed its initialization.
       * Defaults to 60.
       */
      maxNumTries?: number;

      /**
       * The time to wait (in milliseconds) between two queries. Defaults to 1000 ms.
       */
      timeBetweenTries?: number;

      /**
       * The status code the endpoint should return for the call to be considered a success.
       * Defaults to `200`.
       */
      expectedStatus?: number;
    } = {},
  ): Promise<void> {
    const maxNumTries = options.maxNumTries ?? 60;
    const timeBetweenTries = options.timeBetweenTries ?? 1000;
    const expectedStatus = options.expectedStatus ?? 200;

    let numTries = 1;
    while (numTries <= maxNumTries) {
      await new Promise((resolve) => setTimeout(resolve, timeBetweenTries));

      this.logger.debug(
        `🤔 Testing availability of emulator '${emulatorName}' at '${endpoint}'.`,
      );

      try {
        const response = await fetch(endpoint);
        if (response.status !== expectedStatus) {
          throw new Error(`Unexpected status code '${response.status}'.`);
        }

        this.logger.debug(`😍 Emulator '${emulatorName}' is available.`);
        return;
      } catch (error: any) {
        this.logger.debug(
          `😵 Failed availability check for emulator '${emulatorName}': '${error.message}'.`,
        );
      }

      numTries += 1;
    }

    throw new DockerEmulatorAvailabilityCheckTimeoutError(
      emulatorName,
      maxNumTries,
    );
  }
}

/**
 * An error thrown when a host port required by an emulator is already published by another Docker container, which
 * prevented the emulator's container from starting.
 */
export class DockerEmulatorPortConflictError extends Error {
  constructor(
    readonly containerName: string,
    readonly port: number,
    readonly conflictingContainerName: string,
  ) {
    super(
      `Failed to start the Docker container '${containerName}': host port ${port} is already published by the Docker container '${conflictingContainerName}'. Stop that container, or configure a different port for this emulator.`,
    );
  }
}

/**
 * An error thrown when the Docker container running an emulator could not be started.
 */
export class DockerEmulatorStartError extends Error {
  constructor(
    readonly containerName: string,
    readonly processError: ProcessServiceExitCodeError,
  ) {
    const stderr = processError.result.stderr?.trim();
    super(
      `Failed to start the Docker container '${containerName}'.${stderr ? `\n${stderr}` : ''}`,
    );
  }
}

/**
 * An error thrown when {@link DockerEmulatorService.waitForAvailability} fails to make a request the emulator
 * after the maximum number of tries.
 */
export class DockerEmulatorAvailabilityCheckTimeoutError extends Error {
  constructor(emulatorName: string, numTries: number) {
    super(`Failed to bring up '${emulatorName}' after ${numTries} tries.`);
  }
}
