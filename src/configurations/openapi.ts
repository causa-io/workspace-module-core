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
  };
};
