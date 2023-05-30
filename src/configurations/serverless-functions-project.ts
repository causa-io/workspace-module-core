/**
 * Configuration for serverless functions projects (Google Cloud Functions, AWS Lambda, etc).
 */
export type ServerlessFunctionsConfiguration = {
  /**
   * Configuration for serverless functions projects, i.e. packages exposing functions that are deployed by a serverless
   * platform.
   */
  readonly serverlessFunctions?: {
    /**
     * The service managing the serverless functions (Google Cloud Functions, AWS Lambda, etc).
     */
    readonly platform?: string;

    /**
     * The list of functions exposed by this project.
     */
    readonly functions?: {
      [functionName: string]: {
        /**
         * The name of the function in the package.
         */
        readonly entrypoint: string;

        /**
         * The description of the function.
         */
        readonly description?: string;

        /**
         * The event that triggers the function.
         */
        readonly trigger: {
          /**
           * The type of trigger.
           */
          readonly type: 'event';

          /**
           * The ID of the topic triggering the endpoint.
           */
          readonly topic: string;
        };

        /**
         * The data the function produces.
         */
        readonly outputs?: {
          /**
           * The list of event topics to which this function can publish events.
           */
          readonly eventTopics?: string[];
        };
      };
    };
  };
};
