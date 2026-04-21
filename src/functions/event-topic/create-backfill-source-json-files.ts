import { WorkspaceContext } from '@causa/workspace';
import { open } from 'fs/promises';
import { globby } from 'globby';
import {
  type BackfillEvent,
  EventTopicCreateBackfillSource,
} from '../../definitions/index.js';

/**
 * The regular expression used to parse a `json://<glob>` source string.
 */
const JSON_SOURCE_REGEX = /^json:\/\/(?<glob>.+)$/;

/**
 * Parses a single line as JSON and returns the corresponding {@link BackfillEvent}.
 * Logs and skips lines that fail to parse.
 *
 * @param context The {@link WorkspaceContext} to use for logging.
 * @param line The line to parse.
 * @returns The parsed event, or `null` if the line could not be parsed.
 */
function parseEvent(
  context: WorkspaceContext,
  line: string,
): BackfillEvent | null {
  try {
    const event = JSON.parse(line);
    const data = Buffer.from(event.data);
    return { data, attributes: event.attributes, key: event.key };
  } catch (error) {
    context.logger.error(`❌ Failed to parse event '${line}': '${error}'.`);
    return null;
  }
}

/**
 * Yields every parseable {@link BackfillEvent} from the given newline-delimited JSON files.
 *
 * @param context The {@link WorkspaceContext} to use for logging.
 * @param files The list of files to read.
 * @returns An async iterable of parsed events.
 */
async function* iterateJsonFiles(
  context: WorkspaceContext,
  files: string[],
): AsyncIterable<BackfillEvent> {
  for (const file of files) {
    const handle = await open(file);
    try {
      for await (const line of handle.readLines()) {
        const event = parseEvent(context, line);
        if (event) {
          yield event;
        }
      }
    } finally {
      await handle.close();
    }
  }
}

/**
 * Implements {@link EventTopicCreateBackfillSource} for `json://<glob>` sources.
 * Each matched file is expected to contain newline-delimited JSON events with `data`, optional `attributes`, and
 * optional `key` fields. Filtering is not supported.
 */
export class EventTopicCreateBackfillSourceFromJsonFiles extends EventTopicCreateBackfillSource {
  async _call(
    context: WorkspaceContext,
  ): Promise<AsyncIterable<BackfillEvent>> {
    if (this.filter) {
      throw new Error('Filtering JSON events from files is not supported.');
    }

    const match = this.source?.match(JSON_SOURCE_REGEX);
    if (!match?.groups?.glob) {
      throw new Error(
        `The source '${this.source}' is not a valid JSON files source.`,
      );
    }

    const files = await globby(match.groups.glob, {
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    return iterateJsonFiles(context, files.sort());
  }

  _supports(): boolean {
    return !!this.source?.match(JSON_SOURCE_REGEX);
  }
}
