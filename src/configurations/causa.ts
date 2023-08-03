/**
 * A configuration with additional `causa` properties used by workspace functions in this package.
 */
export type CausaConfiguration = {
  readonly causa?: {
    /**
     * The directory where project configurations are written by the `ProjectWriteConfigurations` processor.
     */
    readonly projectConfigurationsDirectory?: string;
  };
};
