import { BackfillEvent } from './event.js';

/**
 * A source that retrieves events to publish in batch.
 */
export interface BackfillEventsSource {
  /**
   * Retrieves a batch of events to publish.
   * `null` indicates that there are no more events to publish, however events should still be fetched if an empty array
   * is returned.
   *
   * @returns A batch of events to publish, or `null` if there are no more events to publish.
   */
  getBatch(): Promise<BackfillEvent[] | null>;

  /**
   * Ensures that the source is properly terminated.
   */
  dispose(): Promise<void>;
}
