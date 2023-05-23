import { WorkspaceContext } from '@causa/workspace';
import axios from 'axios';
import { Logger } from 'pino';
import { DockerContainerPublish, DockerService } from './docker.js';

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
    await this.dockerService.run(dockerImage, {
      detach: true,
      logging: { stdout: null, stderr: 'debug' },
      ...options,
      name: containerName,
      network,
      publish,
    });
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
        await axios.get(endpoint, {
          validateStatus: (status) => status === expectedStatus,
        });

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
 * An error thrown when {@link DockerEmulatorService.waitForAvailability} fails to make a request the emulator
 * after the maximum number of tries.
 */
export class DockerEmulatorAvailabilityCheckTimeoutError extends Error {
  constructor(emulatorName: string, numTries: number) {
    super(`Failed to bring up '${emulatorName}' after ${numTries} tries.`);
  }
}
