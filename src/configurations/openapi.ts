/**
 * Configuration for OpenAPI specifications-related operations.
 */
export type OpenApiConfiguration = {
  /**
   * Configuration for OpenAPI specifications-related operations.
   */
  readonly openApi?: {
    /**
     * An OpenAPI specification file to be used as the base when generating the specification for the entire workspace.
     */
    readonly global?: object;

    /**
     * A list of glob patterns matching OpenAPI specification files to merge when generating the specification for a
     * project. The globs are resolved relative to the project directory.
     */
    readonly specifications?: string[];

    /**
     * If set, the list of servers will be generated using a value from the configuration of each environment.
     * This should be the path to the configuration property containing the server URL.
     */
    readonly serversFromEnvironmentConfiguration?: string;
  };
};
