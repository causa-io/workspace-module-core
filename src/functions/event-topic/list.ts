import { WorkspaceContext, listFilesAndFormat } from '@causa/workspace';
import type { EventsConfiguration } from '../../configurations/index.js';
import {
  DuplicateEventTopicError,
  type EventTopicDefinition,
  EventTopicList,
} from '../../definitions/index.js';

/**
 * The default format string for topic IDs.
 */
const DEFAULT_TOPIC_ID_FORMAT = '${ domain }.${ topic }.${ version }';

/**
 * The default glob pattern to find topic schema definition files in the workspace.
 */
const DEFAULT_TOPIC_GLOBS = ['domains/*/events/*/*.yaml'];

/**
 * The default regular expression to extract formatting parts from schema file paths.
 */
const DEFAULT_TOPIC_REGULAR_EXPRESSION =
  '^domains\\/(?<domain>[\\w-]+)\\/events\\/(?<topic>[\\w-]+)\\/(?<version>v\\d+)\\.yaml$';

/**
 * Implements the {@link EventTopicList} function.
 * This function can be configured using the `events.topics` object in the configuration and should not be implemented
 * by any other plugin.
 */
export class EventTopicListForAll extends EventTopicList {
  async _call(context: WorkspaceContext): Promise<EventTopicDefinition[]> {
    const eventsConf = context.asConfiguration<EventsConfiguration>();
    const format =
      eventsConf.get('events.topics.format') ?? DEFAULT_TOPIC_ID_FORMAT;
    const globs = eventsConf.get('events.topics.globs') ?? DEFAULT_TOPIC_GLOBS;
    const regExp =
      eventsConf.get('events.topics.regularExpression') ??
      DEFAULT_TOPIC_REGULAR_EXPRESSION;

    const filesAndFormats = await listFilesAndFormat(
      globs,
      regExp,
      format,
      context.rootPath,
      {
        nonMatchingPathHandler: (path) =>
          context.logger.warn(
            `📂 Path '${path}' matches the event topic globs but did not match the regular expression. It will be ignored from the schema definition files.`,
          ),
      },
    );

    const ids = new Set<string>();
    const definitions: EventTopicDefinition[] = filesAndFormats.map((ff) => {
      const id = ff.rendered;
      if (ids.has(id)) {
        throw new DuplicateEventTopicError(id);
      }

      ids.add(id);

      return { id, formatParts: ff.formatParts, schemaFilePath: ff.filePath };
    });

    return definitions;
  }

  _supports(): boolean {
    return true;
  }
}
