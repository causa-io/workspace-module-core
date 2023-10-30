import { WorkspaceContext } from '@causa/workspace';
import { readFile } from 'fs/promises';
import {
  BackfillTemporaryData,
  EventTopicBrokerDeleteTopic,
  EventTopicBrokerDeleteTriggerResource,
  EventTopicCleanBackfill,
} from '../../definitions/index.js';

/**
 * Implements {@link EventTopicCleanBackfill} for any tech stack.
 * This uses {@link EventTopicBrokerDeleteTopic} and {@link EventTopicBrokerDeleteTriggerResource} to clean up the
 * resources listed in the backfill file.
 */
export class EventTopicCleanBackfillForAll extends EventTopicCleanBackfill {
  async _call(context: WorkspaceContext): Promise<void> {
    const dataBuffer = await readFile(this.file);
    const data: BackfillTemporaryData = JSON.parse(dataBuffer.toString());

    context.logger.info('🔥 Removing temporary backfill resources.');

    const resourceIdsAndPromises = data.temporaryTriggerResourceIds.map(
      (id) => ({
        id,
        promise: context.call(EventTopicBrokerDeleteTriggerResource, { id }),
      }),
    );
    if (data.temporaryTopicId) {
      resourceIdsAndPromises.push({
        id: data.temporaryTopicId,
        promise: context.call(EventTopicBrokerDeleteTopic, {
          id: data.temporaryTopicId,
        }),
      });
    }

    const results = await Promise.all(
      resourceIdsAndPromises.map(async ({ id, promise }) => {
        try {
          await promise;
          return true;
        } catch (error: any) {
          const message = error.message ?? error;
          context.logger.error(
            `❌ Failed to delete resource '${id}': '${message}'.`,
          );
          return false;
        }
      }),
    );

    if (results.every((r) => r)) {
      context.logger.info(
        '✅ Successfully cleaned resources for the backfill.',
      );
    } else {
      throw new Error(
        'Failed to clean some of the resources for the backfill.',
      );
    }
  }

  _supports(): boolean {
    return true;
  }
}
