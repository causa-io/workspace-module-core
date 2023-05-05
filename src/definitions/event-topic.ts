import { CliCommand, ParentCliCommandDefinition } from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { IsObject } from 'class-validator';

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
