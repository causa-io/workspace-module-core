/**
 * The definition of a secret to pass to the Docker build command.
 */
export type BuildSecret =
  | {
      /**
       * The source file for the secret.
       */
      readonly file: string;
    }
  | {
      /**
       * The value of the secret.
       * In this case the value will be passed as an environment variable to the Docker command.
       */
      readonly value: string;
    };

/**
 * Configuration for service container projects.
 */
export type ServiceContainerConfiguration = {
  readonly project?: {
    /**
     * The deployed version of the service, which should correspond to a version tag in the container registry.
     */
    readonly activeVersion?: string;
  };

  /**
   * Configuration for service container projects, i.e. services that are run as generic Docker containers.
   */
  readonly serviceContainer?: {
    /**
     * The processor architecture used when building (and running) Docker images for the service.
     */
    readonly architecture?: string;

    /**
     * The platform / orchestrator on which the service is deployed.
     */
    readonly platform?: string;

    /**
     * The Dockerfile used to build the image for the service.
     * Language-specific modules may provide a default value for this.
     */
    readonly buildFile?: string;

    /**
     * Docker build arguments when building the image for the service.
     * Supports rendering.
     */
    readonly buildArgs?: Record<string, string>;

    /**
     * Docker build `--secret` arguments to pass when building the image for the service.
     * Supports rendering.
     */
    readonly buildSecrets?: Record<string, BuildSecret>;

    /**
     * The endpoints exposed by the service.
     */
    readonly endpoints?: {
      /**
       * The HTTP endpoints exposed by the service.
       */
      readonly http?: string[];
    };

    /**
     * The environment variables passed to the service.
     */
    readonly environmentVariables?: Record<string, string>;

    /**
     * The maximum CPU allowed to the container, as a "quantity" Kubernetes type.
     */
    readonly cpuLimit?: string;

    /**
     * The maximum memory allowed to the container, as a "quantity" Kubernetes type.
     */
    readonly memoryLimit?: string;

    /**
     * The minimum number of instances of the service that should be running.
     */
    readonly minInstances?: number;

    /**
     * The maximum number of instances of the service that should be running.
     */
    readonly maxInstances?: number;

    /**
     * A map of triggers that call the service's endpoints when they occur.
     */
    readonly triggers?: {
      [triggerName: string]: {
        /**
         * The type of trigger.
         */
        readonly type: 'event';

        /**
         * The ID of the topic triggering the endpoint.
         */
        readonly topic: string;
      };
    };

    /**
     * The data this service produces.
     */
    readonly outputs?: {
      /**
       * The list of event topics to which this service can publish events.
       */
      readonly eventTopics?: string[];
    };
  };
};
