import {
  CliArgument,
  CliCommand,
  CliOption,
  ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsObject, IsString } from 'class-validator';

/**
 * The definition for an event topic.
 * Definitions are found by looking for files matching the configured globs and regular expression.
 * A definition file contains the schema for a topic.
 * Its ID is constructed from parts of the file path to the definition.
 */
export type EventTopicDefinition = {
  /**
   * The ID of the event topic.
   * This is formatted using the {@link EventDefinition.formatParts} extracted from the
   * {@link EventDefinition.schemaFilePath} using the regular expression in the configuration.
   */
  readonly id: string;

  /**
   * The file path to the schema definition for the topic.
   */
  readonly schemaFilePath: string;

  /**
   * The parts extracted from the {@link EventDefinition.schemaFilePath} using the configured regular expression.
   */
  readonly formatParts: Record<string, string>;
};

/**
 * Describes the event topics consumed and produced by a project.
 */
export type ReferencedEventTopics = {
  /**
   * The IDs of the topics that are consumed by the project.
   */
  readonly consumed: string[];

  /**
   * The IDs of the topics to which the project publishes events.
   */
  readonly produced: string[];
};

/**
 * The `events` parent command, grouping all commands related to managing events, their topics, and the corresponding
 * schemas.
 */
export const eventsCommandDefinition: ParentCliCommandDefinition = {
  name: 'events',
  description: 'Manages events and topics.',
};

/**
 * The base error for event topic-related errors.
 */
export class EventTopicError extends Error {}

/**
 * An error thrown when two topic definition files lead to the same topic ID being rendered using the format string.
 */
export class DuplicateEventTopicError extends EventTopicError {
  constructor(readonly topicId: string) {
    super(`Found duplicate topic '${topicId}'.`);
  }
}

/**
 * Lists all the event topics in the workspace.
 */
export abstract class EventTopicList extends WorkspaceFunction<
  Promise<EventTopicDefinition[]>
> {}

/**
 * Generates the source code for the given event topic definitions in the current project.
 */
export abstract class EventTopicGenerateCode extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The definitions of the topics for which code should be generated.
   */
  @IsObject({ each: true })
  readonly definitions!: EventTopicDefinition[];
}

/**
 * Generates the source code for all event topics referenced in the current project.
 * Returns the list of topic IDs for which code was generated.
 */
@CliCommand({
  parent: eventsCommandDefinition,
  name: 'generateCode',
  description: `Generates the source code for all topic schemas the project consumes and produces.
Make sure the project correctly defines its triggers, inputs, and outputs to have all schemas generated.`,
  summary:
    'Generates the source code for all topic schemas the project consumes and produces.',
  aliases: ['genCode'],
  outputFn: (topicIds) => console.log(topicIds.join('\n')),
})
export abstract class EventTopicGenerateCodeReferencedInProject extends WorkspaceFunction<
  Promise<string[]>
> {}

/**
 * Returns all the event topics that are either consumed or produced by the current project.
 */
export abstract class EventTopicListReferencedInProject extends WorkspaceFunction<
  Promise<ReferencedEventTopics>
> {}

/**
 * Temporary data stored in the backfill file, listing the resources that should be cleaned up when the backfill is
 * complete.
 */
export type BackfillTemporaryData = {
  /**
   * The ID of the temporary topic.
   * This is `null` if the main topic was used for publishing events.
   */
  readonly temporaryTopicId: string | null;

  /**
   * A list of resource IDs that were created as part of the temporary triggers creation.
   * Those should be cleaned up when the backfill is complete.
   */
  readonly temporaryTriggerResourceIds: string[];
};

/**
 * Backfills events for an event topic.
 * This supports several use cases, where existing event triggers for the topic may or may not process the backfilled
 * events. Temporary triggers can be created for the backfill, and deleted afterwards. The source of events to backfill
 * can be the default storage for the broker, or a custom source.
 * Returns the path to a file that contains the resources that should be deleted after the backfill has completed.
 */
@CliCommand({
  parent: eventsCommandDefinition,
  name: 'backfill',
  description: `Backfills events for an event topic.
Events can be backfilled using the existing topic (in which case all existing triggers receive the events), or through a temporary topic (in which case only the triggers passed to the command receive the events).
Temporary triggers can be created for the backfill, and deleted afterwards using the 'cleanBackfill' command.
If no source is specified, the events are retrieved from the default storage for the broker. Optionally, a custom source might be used.
Finally, some event sources might support filtering of the events to backfill.`,
  summary: 'Backfills events for an event topic.',
  outputFn: (result) => console.log(result),
})
export abstract class EventTopicBackfill extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * The full event topic name (e.g. `my-domain.my-event.v1`) for which events should be backfilled.
   */
  @CliArgument({
    name: 'eventTopic',
    position: 0,
    description: 'The full event topic name (e.g. `my-domain.my-event.v1`).',
  })
  @IsString()
  readonly eventTopic!: string;

  /**
   * Whether a temporary topic should be created for the backfill.
   * When using a temporary topic, existing triggers do not receive the backfilled events, only the `triggers` passed to
   * the function.
   * If this is `false`, backfilled events are published to the existing topic, and all existing triggers will receive
   * the events. Temporary triggers can still be created by passing them in the `triggers`.
   */
  @CliOption({
    flags: '-c, --createTemporaryTopic',
    description:
      'Whether a temporary topic should be created for the backfill instead of using the existing one.',
  })
  @IsBoolean()
  @AllowMissing()
  readonly createTemporaryTopic?: boolean;

  /**
   * The source for events to publish.
   * By default, events will be fetched from the configured data storage using the `eventTopic` name.
   */
  @CliOption({
    flags: '-s, --source <source>',
    description:
      'The source for events to publish. If not set, events are fetched from the default storage for the broker.',
  })
  @IsString()
  @AllowMissing()
  readonly source?: string;

  /**
   * A filter for source events.
   * The format depends on the source type.
   */
  @CliOption({
    flags: '-f, --filter <filter>',
    description:
      'A filter for source events. The format and whether this is supported depends on the source type.',
  })
  @IsString()
  @AllowMissing()
  readonly filter?: string;

  /**
   * A list of triggers to create for the backfill.
   * If a temporary topic is created, those will be the only triggers on the topic.
   */
  @CliOption({
    flags: '-t, --trigger <triggers...>',
    description:
      'A list of temporary triggers to create for the backfill. The format depends on the type of trigger.',
  })
  @IsString({ each: true })
  @AllowMissing()
  readonly triggers?: string[];

  /**
   * The path to the file that will be written with the temporary resources to delete.
   */
  @CliOption({
    flags: '-o, --output <output>',
    description: `The path to the file that will be written with the temporary resources to delete. This is used by the 'cleanBackfill' command.`,
  })
  readonly output?: string;
}

/**
 * Cleans up resources created for a backfill based on the file outputted by the {@link EventTopicBackfill} function.
 */
@CliCommand({
  parent: eventsCommandDefinition,
  name: 'cleanBackfill',
  description: `Cleans up temporary resources created for a backfill.
This includes temporary triggers and topic.`,
  summary: 'Cleans up temporary resources created for a backfill.',
})
export abstract class EventTopicCleanBackfill extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The path to the file that was written by the {@link EventTopicBackfill} function.
   */
  @CliArgument({
    name: 'file',
    position: 0,
    description: 'The path returned by the `backfill` command.',
  })
  @IsString()
  readonly file!: string;
}

/**
 * Creates a topic for the configured broker.
 * Returns the (broker-specific) topic ID.
 */
export abstract class EventTopicBrokerCreateTopic extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * A name for the topic.
   */
  @IsString()
  readonly name!: string;
}

/**
 * Returns the broker-specific topic ID for an event topic.
 */
export abstract class EventTopicBrokerGetTopicId extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * The full event topic name (e.g. `my-domain.my-event.v1`).
   */
  @IsString()
  readonly eventTopic!: string;
}

/**
 * Creates a trigger on the given topic for the specified service.
 * Returns IDs of resources that should be deleted after the backfill has completed.
 */
export abstract class EventTopicBrokerCreateTrigger extends WorkspaceFunction<
  Promise<string[]>
> {
  /**
   * The unique ID for the backfilling operation.
   */
  @IsString()
  readonly backfillId!: string;

  /**
   * The broker-specific topic ID used as trigger.
   */
  @IsString()
  readonly topicId!: string;

  /**
   * An URI that describes the trigger to create, e.g. an existing resource to copy, etc.
   */
  @IsString()
  readonly trigger!: string;
}

/**
 * An error thrown when a trigger cannot be created, but some resources for the trigger might have already been created.
 * This should be thrown by implementations of the {@link EventTopicBrokerCreateTrigger} function.
 */
export class EventTopicTriggerCreationError extends Error {
  /**
   * Creates a new {@link EventTopicTriggerCreationError}.
   *
   * @param parent The parent error.
   * @param resourceIds The IDs of the resources that should be deleted.
   */
  constructor(
    readonly parent: any,
    readonly resourceIds: string[],
  ) {
    super(parent.message);
  }
}

/**
 * Publishes events from a source to the given topic.
 */
export abstract class EventTopicBrokerPublishEvents extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The broker-specific ID for the topic to which events should be published.
   */
  @IsString()
  readonly topicId!: string;

  /**
   * The full event topic name.
   * Might be used as a hint for the source, to get the schema for publishing, etc.
   */
  @IsString()
  readonly eventTopic!: string;

  /**
   * The source for events to publish.
   * By default, events will be fetched from the configured data storage using the `eventTopic` name.
   */
  @IsString()
  @AllowMissing()
  readonly source?: string;

  /**
   * A filter for source events.
   * The format depends on the source type and some source types might not support a filter at all.
   */
  @IsString()
  @AllowMissing()
  readonly filter?: string;
}

/**
 * Deletes a resource that was created for a temporary trigger.
 */
export abstract class EventTopicBrokerDeleteTriggerResource extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * An ID that describes the resource.
   */
  @IsString()
  readonly id!: string;
}

/**
 * Deletes a topic using its broker-specific ID.
 */
export abstract class EventTopicBrokerDeleteTopic extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The broker-specific ID.
   */
  @IsString()
  readonly id!: string;
}
