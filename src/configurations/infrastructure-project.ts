import { ProcessorInstruction } from '@causa/workspace';

/**
 * Configuration for infrastructure projects.
 */
export type InfrastructureProjectConfiguration = {
  /**
   * Configuration for infrastructure projects.
   */
  readonly infrastructure?: {
    /**
     * The list of processors that should be run prior to infrastructure operations to set up the workspace.
     * Processors should implement the `InfrastructureProcessor` interface.
     */
    readonly processors?: ProcessorInstruction[];

    /**
     * Variables to be passed to the infrastructure as code system (e.g. Terraform).
     * Supports rendering.
     */
    readonly variables?: Record<string, string>;
  };
};
