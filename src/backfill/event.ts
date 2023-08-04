/**
 * A single event that should be published.
 */
export type BackfillEvent = {
  /**
   * The data to publish.
   */
  data: Buffer;

  /**
   * Optional attributes for the message.
   */
  attributes?: Record<string, string>;

  /**
   * Optional ordering key for the message.
   */
  key?: string;
};
