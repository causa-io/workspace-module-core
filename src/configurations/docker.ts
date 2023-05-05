/**
 * The schema for the configuration of Docker.
 */
export type DockerConfiguration = {
  /**
   * Configuration when using Docker in the workspace.
   */
  docker?: {
    /**
     * Configuration for the local Docker network.
     */
    network?: {
      /**
       * The name of the local Docker network.
       */
      name?: string;
    };
  };
};
