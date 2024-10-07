import { WorkspaceContext } from '@causa/workspace';
import { once } from 'events';
import { type FileHandle, open } from 'fs/promises';
import { globby } from 'globby';
import { Interface } from 'readline';
import type { BackfillEvent } from './event.js';
import type { BackfillEventsSource } from './source.js';

/**
 * The approximate size of a batch of events fetched from the source.
 * The actual size may vary.
 */
const EVENT_BATCH_SIZE = 10000;

/**
 * A {@link BackfillEventsSource} that reads newline-delimited JSON events from files.
 */
export class JsonFilesEventSource implements BackfillEventsSource {
  /**
   * The index of the next file to read.
   */
  private nextFileIndex = 0;

  /**
   * The current batch of events being buffered.
   */
  private currentBatch: BackfillEvent[] = [];

  /**
   * The handle of the current file being read.
   */
  private currentFileHandle: FileHandle | null = null;

  /**
   * The line interface of the current file being read.
   */
  private currentLines: Interface | null = null;

  /**
   * A promise that resolves when the current file is closed.
   */
  private closePromise: Promise<void> | null = null;

  private constructor(
    readonly context: WorkspaceContext,
    readonly files: string[],
  ) {}

  /**
   * Parses a single line as a JSON object and returns the corresponding {@link BackfillEvent}.
   *
   * @param line The line to parse.
   * @returns The parsed event, or `null` if the line could not be parsed.
   */
  private parseEvent(line: string): BackfillEvent | null {
    try {
      const event = JSON.parse(line);
      const data = Buffer.from(event.data);
      return { data, attributes: event.attributes, key: event.key };
    } catch (error) {
      this.context.logger.error(
        `❌ Failed to parse event '${line}': '${error}'.`,
      );
      return null;
    }
  }

  /**
   * Sets up the next file to read by creating a handle and a line interface for it.
   *
   * @returns The `readline` {@link Interface} for the next file, or `null` if there are no more files.
   */
  private async setUpNextFile(): Promise<Interface | null> {
    if (this.nextFileIndex >= this.files.length) {
      return null;
    }

    const handle = await open(this.files[this.nextFileIndex]);
    const lines = handle.readLines();
    lines.pause();
    lines.on('line', (line) => {
      const event = this.parseEvent(line);
      if (!event) {
        return;
      }

      this.currentBatch.push(event);

      if (this.currentBatch.length === EVENT_BATCH_SIZE) {
        lines.pause();
      }
    });

    this.currentFileHandle = handle;
    this.currentLines = lines;
    this.closePromise = once(lines, 'close').then(async () => {
      this.currentFileHandle = null;
      this.currentLines = null;
      await handle.close();
    });

    this.nextFileIndex++;

    return lines;
  }

  async getBatch(): Promise<BackfillEvent[] | null> {
    const currentLines = this.currentLines ?? (await this.setUpNextFile());
    if (!currentLines) {
      return null;
    }

    const pausePromise = once(currentLines, 'pause');
    currentLines.resume();

    await Promise.race([pausePromise, this.closePromise]);

    const batch = this.currentBatch;
    this.currentBatch = [];
    return batch;
  }

  async dispose(): Promise<void> {
    await this.currentFileHandle?.close();
    this.currentBatch = [];
    this.closePromise = null;
    this.currentLines = null;
    this.currentFileHandle = null;
    this.nextFileIndex = this.files.length;
  }

  /**
   * Creates a {@link JsonFilesEventSource} from a source string.
   * The source string should be of the form `json://<glob>`, where `<glob>` is a glob pattern matching the files to
   * read.
   * The `filter` argument is not supported and should be `undefined`.
   *
   * @param context The {@link WorkspaceContext}.
   * @param source A string describing the source of the events.
   * @param filter An optional filter to select events.
   *   This is not supported and should be `undefined`.
   * @returns A {@link JsonFilesEventSource} if the source is a valid JSON files source, or `null` otherwise.
   */
  static async fromSourceAndFilter(
    context: WorkspaceContext,
    source: string,
    filter?: string,
  ): Promise<JsonFilesEventSource | null> {
    const match = source.match(/^json:\/\/(?<glob>.+)$/);
    if (!match?.groups?.glob) {
      return null;
    }

    if (filter) {
      throw new Error('Filtering JSON events from files is not supported.');
    }

    const files = await globby(match.groups.glob, {
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    return new JsonFilesEventSource(context, files.sort());
  }
}
