/**
 * Configuration for events.
 */
export type EventsConfiguration = {
  /**
   * Configuration for events and how they are exchanged between services.
   */
  readonly events?: {
    /**
     * The format to which events are serialized when exchanged through the message broker.
     */
    readonly format?: 'json';

    /**
     * The message broker used to exchange events between services.
     */
    readonly broker?: string;

    /**
     * Defines how topic definitions are found in the workspace.
     */
    readonly topics?: {
      /**
       * The format string using groups from the regular expression used to make the topic full names.
       */
      readonly format?: string;

      /**
       * A list of glob patterns to find topic schema definition files in the workspace.
       */
      readonly globs?: string[];

      /**
       * The regular expression used to extract groups from the topic schemas file paths.
       */
      readonly regularExpression?: string;
    };
  };
};
