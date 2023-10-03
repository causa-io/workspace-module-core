import { WorkspaceContext } from '@causa/workspace';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import {
  BuildSecret,
  ServiceContainerConfiguration,
} from '../configurations/index.js';
import { DockerService } from './docker.js';

/**
 * A service providing the base logic to build service container Docker images.
 * It relies on several options that are common to all service container projects.
 * Additional language options can be provided by the workspace function using this service.
 */
export class ServiceContainerBuilderService {
  /**
   * The underlying Docker service.
   */
  private readonly dockerService: DockerService;

  /**
   * The root path of the workspace.
   */
  readonly rootPath: string;

  /**
   * The processor architecture used when building Docker images.
   */
  readonly platform: string | undefined;

  /**
   * The Dockerfile used to build the image.
   */
  readonly file: string | undefined;

  /**
   * Docker build arguments when building the image.
   */
  readonly buildArgs: Promise<Record<string, string> | undefined>;

  /**
   * Docker build `--secret` arguments to pass when building the image.
   */
  readonly buildSecrets: Promise<Record<string, BuildSecret> | undefined>;

  constructor(context: WorkspaceContext) {
    this.dockerService = context.service(DockerService);
    this.rootPath = context.rootPath;

    const serviceContainerConf =
      context.asConfiguration<ServiceContainerConfiguration>();
    this.platform = serviceContainerConf.get('serviceContainer.architecture');
    const file = serviceContainerConf.get('serviceContainer.buildFile');
    this.file = file ? resolve(this.rootPath, file) : undefined;
    this.buildArgs = serviceContainerConf.getAndRender(
      'serviceContainer.buildArgs',
    );
    this.buildSecrets = serviceContainerConf.getAndRender(
      'serviceContainer.buildSecrets',
    );
  }

  /**
   * Builds the Docker image for a service container.
   *
   * @param path The path to the root of the Docker context (e.g. the project root).
   * @param imageName The name (tag) of the image to build.
   * @param defaultFile The default Dockerfile to use, is `serviceContainer.buildFile` is not set.
   * @param options Additional options to pass to the Docker build command.
   */
  async build(
    path: string,
    imageName: string,
    defaultFile: string,
    options: {
      /**
       * Additional build arguments to pass to the Docker build command.
       * They will be merged with (and possibly overridden by) the `serviceContainer.buildArgs` configuration.
       */
      baseBuildArgs?: Record<string, string>;

      /**
       * Additional secrets to pass to the Docker build command.
       * They will be merged with (and possibly overridden by) the `serviceContainer.buildSecrets` configuration.
       */
      baseBuildSecrets?: Record<string, BuildSecret>;
    } = {},
  ): Promise<void> {
    const file = this.file ?? defaultFile;

    const buildArgs = {
      ...options.baseBuildArgs,
      ...(await this.buildArgs),
    };

    const buildSecrets = {
      ...options.baseBuildSecrets,
      ...(await this.buildSecrets),
    };
    const environment = { ...process.env };
    const secrets = Object.fromEntries(
      Object.entries(buildSecrets).map(([key, secret]) => {
        if ('file' in secret) {
          const source = resolve(this.rootPath, secret.file);
          return [key, { source }];
        }

        const env = randomBytes(3).toString('hex');
        environment[env] = secret.value;
        return [key, { env }];
      }),
    );

    await this.dockerService.build(path, {
      file,
      platform: this.platform,
      buildArgs,
      secrets,
      tags: [imageName],
      environment,
    });
  }
}
