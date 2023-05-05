/**
 * Configuration for service container projects.
 */
export type ServiceContainerConfiguration = {
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
     * Docker build arguments when building the image for the service.
     * Supports rendering.
     */
    readonly buildArgs?: Record<string, string>;

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
