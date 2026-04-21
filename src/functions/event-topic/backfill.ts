import { WorkspaceContext } from '@causa/workspace';
import { randomBytes } from 'crypto';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  type BackfillTemporaryData,
  EventTopicBackfill,
  EventTopicBrokerCreateTopic,
  EventTopicBrokerCreateTrigger,
  EventTopicBrokerGetTopicId,
  EventTopicBrokerPublishEvents,
  EventTopicCreateBackfillSource,
  EventTopicTriggerCreationError,
} from '../../definitions/index.js';

/**
 * The regular expression used to parse a project-scoped trigger specification.
 * The format is `<projectPath>#<triggerName>[?<options>]`, where:
 * - `<projectPath>` is relative to the workspace root.
 * - `<triggerName>` is the name of the trigger within the project.
 * - `<options>` is an optional URL query string (e.g. `a=1&b=2`) forwarded as a `Record<string, string>`.
 */
const PROJECT_TRIGGER_REGEX =
  /^(?<projectPath>[^#?]+)#(?<name>[^?]+)(?:\?(?<options>.*))?$/;

/**
 * Implements {@link EventTopicBackfill} for any tech stack.
 * This should probably be the only implementation, as it implements the generic logic for backfilling, relying on other
 * broker and stack-specific workspace functions for the actual work.
 *
 * This uses:
 * - {@link EventTopicBrokerCreateTopic} to create a temporary topic if needed.
 * - {@link EventTopicBrokerGetTopicId} to get the topic ID for the main topic.
 * - {@link EventTopicBrokerCreateTrigger} to create temporary triggers if needed.
 * - {@link EventTopicBrokerPublishEvents} to publish events to the topic.
 */
export class EventTopicBackfillForAll extends EventTopicBackfill {
  /**
   * Creates a temporary topic for the backfill or returns the ID of the main topic.
   *
   * @param context The {@link WorkspaceContext}.
   * @param backfillId The unique ID for the backfilling operation.
   * @returns The ID of the topic to use for publishing events, and the {@link BackfillTemporaryData}.
   */
  private async setUpTopic(
    context: WorkspaceContext,
    backfillId: string,
  ): Promise<{
    topicId: string;
    temporaryData: BackfillTemporaryData;
  }> {
    const topicId = this.createTemporaryTopic
      ? await context.call(EventTopicBrokerCreateTopic, {
          name: `backfill-${backfillId}`,
        })
      : await context.call(EventTopicBrokerGetTopicId, {
          eventTopic: this.eventTopic,
        });

    context.logger.info(`📫 Events will be published to topic '${topicId}'.`);

    const temporaryData: BackfillTemporaryData = {
      temporaryTopicId: this.createTemporaryTopic ? topicId : null,
      temporaryTriggerResourceIds: [],
    };

    return { topicId, temporaryData };
  }

  /**
   * Creates a single trigger by delegating to {@link EventTopicBrokerCreateTrigger}.
   *
   * If `trigger` matches {@link PROJECT_TRIGGER_REGEX}, the workspace context is cloned with the matched project path
   * as working directory and the trigger is forwarded as a {@link EventTopicBrokerTrigger} object. Otherwise, the
   * function is called on the current context with the raw trigger string.
   *
   * @param context The current {@link WorkspaceContext}.
   * @param backfillId The unique ID for the backfilling operation.
   * @param topicId The ID of the topic to use as trigger.
   * @param trigger The trigger specification to create.
   * @returns The IDs of resources created for the trigger, to be cleaned up after the backfill.
   */
  private async createTrigger(
    context: WorkspaceContext,
    backfillId: string,
    topicId: string,
    trigger: string,
  ): Promise<string[]> {
    const match = trigger.match(PROJECT_TRIGGER_REGEX);
    if (!match?.groups) {
      return await context.call(EventTopicBrokerCreateTrigger, {
        backfillId,
        topicId,
        trigger,
      });
    }

    const { projectPath, name, options } = match.groups;

    let projectContext: WorkspaceContext;
    try {
      const workingDirectory = join(context.rootPath, projectPath);
      projectContext = await context.clone({ workingDirectory });
    } catch (error: any) {
      throw new EventTopicTriggerCreationError(error, []);
    }

    if (!projectContext.projectPath) {
      throw new EventTopicTriggerCreationError(
        new Error(
          `Trigger '${trigger}' references '${projectPath}', which is not a project directory.`,
        ),
        [],
      );
    }

    const parsedOptions = Object.fromEntries(
      new URLSearchParams(options ?? ''),
    );
    return projectContext.call(EventTopicBrokerCreateTrigger, {
      backfillId,
      topicId,
      trigger: { name, options: parsedOptions },
    });
  }

  /**
   * Creates temporary triggers for the backfill, and fills the {@link BackfillTemporaryData} accordingly.
   *
   * @param context The {@link WorkspaceContext}.
   * @param backfillId The unique ID for the backfilling operation.
   * @param topicId The ID of the topic to use as trigger.
   * @param data The {@link BackfillTemporaryData} to fill with crated temporary resource IDs.
   */
  private async createTriggers(
    context: WorkspaceContext,
    backfillId: string,
    topicId: string,
    data: BackfillTemporaryData,
  ): Promise<void> {
    if (!this.triggers?.length) {
      return;
    }

    context.logger.info('🧱 Creating event triggers.');

    const results = await Promise.allSettled(
      this.triggers.map(async (trigger) => {
        try {
          const resourceIds = await this.createTrigger(
            context,
            backfillId,
            topicId,
            trigger,
          );

          data.temporaryTriggerResourceIds.push(...resourceIds);
        } catch (error) {
          if (error instanceof EventTopicTriggerCreationError) {
            data.temporaryTriggerResourceIds.push(...error.resourceIds);
          }

          throw error;
        }
      }),
    );

    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )?.reason;
    if (firstError) {
      throw firstError;
    }
  }

  async _call(context: WorkspaceContext): Promise<string> {
    if (this.createTemporaryTopic && !this.triggers?.length) {
      throw new Error(
        'At least one temporary trigger should be defined when using a temporary topic.',
      );
    }

    const backfillId = randomBytes(3).toString('hex');
    context.logger.info(`🎉 Initializing backfill with ID '${backfillId}'.`);

    const { topicId, temporaryData } = await this.setUpTopic(
      context,
      backfillId,
    );

    const backfillFile = this.output
      ? resolve(this.output)
      : join(context.rootPath, `backfill-${backfillId}.json`);
    const cleanBackfillCommand = [
      'cs',
      'events',
      'cleanBackfill',
      ...(context.environment ? ['-e', context.environment] : []),
      `"${backfillFile}"`,
    ].join(' ');

    try {
      await this.createTriggers(context, backfillId, topicId, temporaryData);

      const eventsSource = await context.call(EventTopicCreateBackfillSource, {
        eventTopic: this.eventTopic,
        source: this.source,
        filter: this.filter,
      });

      await context.call(EventTopicBrokerPublishEvents, {
        topicId,
        eventTopic: this.eventTopic,
        source: () => eventsSource,
      });

      context.logger.info('✅ Successfully published all events.');
      context.logger.info(
        `💡 Once backfilling is complete, temporary resources can be cleaned using '${cleanBackfillCommand}'.`,
      );
    } catch (error) {
      context.logger.warn(
        `⚠️ Backfilling failed but there might be temporary resources to clean up using '${cleanBackfillCommand}'.`,
      );
      throw error;
    } finally {
      await writeFile(backfillFile, JSON.stringify(temporaryData));
    }

    return backfillFile;
  }

  _supports(): boolean {
    return true;
  }
}
