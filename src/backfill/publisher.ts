import { WorkspaceContext } from '@causa/workspace';
import type { BackfillEvent } from './event.js';
import type { BackfillEventsSource } from './source.js';

/**
 * A publisher that publishes events to backfill by getting batches of events from a source.
 */
export abstract class BackfillEventPublisher {
  constructor(protected readonly context: WorkspaceContext) {}

  /**
   * Publishes an event to the configured topic.
   *
   * @param event The event to publish.
   * @returns A promise that resolves when the publisher has caught up with publishing, or `null` if other events can be
   *   published immediately.
   */
  protected abstract publishEvent(event: BackfillEvent): Promise<void> | null;

  /**
   * Waits for all events to be published.
   */
  protected abstract flush(): Promise<void>;

  /**
   * Publishes all events from the given source.
   *
   * @param source The source of events to publish.
   */
  async publishFromSource(source: BackfillEventsSource): Promise<void> {
    this.context.logger.info('📫 Publishing events.');

    let numEvents = 0;
    try {
      while (true) {
        this.context.logger.debug('Requesting a batch of events.');
        const events = await source.getBatch();
        if (!events) {
          this.context.logger.debug('No more events to publish.');
          break;
        }
        this.context.logger.debug(`Fetched ${events.length} events.`);

        for (const event of events) {
          numEvents += 1;

          const wait = this.publishEvent(event);
          if (wait) {
            this.context.logger.debug(
              'Waiting for the publisher to catch up before resuming publishing.',
            );
            await wait;
          }
        }
      }
    } finally {
      await source.dispose();
    }

    await this.flush();

    this.context.logger.info(`📫 Finished publishing ${numEvents} events.`);
  }
}
