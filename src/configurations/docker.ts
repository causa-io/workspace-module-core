/**
 * The schema for the configuration of Docker.
 */
export type DockerConfiguration = {
  /**
   * Configuration when using Docker in the workspace.
   */
  readonly docker?: {
    /**
     * Configuration for the local Docker network.
     */
    readonly network?: {
      /**
       * The name of the local Docker network.
       */
      readonly name?: string;
    };
  };
};
