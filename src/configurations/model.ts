/**
 * Configuration for the business model definitions.
 */
export type ModelConfiguration = {
  /**
   * Configuration for the business model definitions.
   */
  readonly model?: {
    /**
     * The schema format in which the model is defined.
     */
    readonly schema?: 'jsonschema';

    /**
     * A list of code generators to run in a project when the `model generateCode` command is run.
     */
    readonly codeGenerators?: {
      /**
       * The name of the generator to run.
       */
      readonly generator: string;
    }[];
  };
};
