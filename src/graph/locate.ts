import type { WorkspaceContext } from '@causa/workspace';
import { ConfigurationReaderSourceType } from '@causa/workspace/configuration';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import {
  isMap,
  isNode,
  isScalar,
  LineCounter,
  parseDocument,
  type Document,
} from 'yaml';
import { toPointer } from '../jsonschema/pointer.js';
import type { GraphOriginSource, GraphSourceLocation } from './generated.js';

/**
 * A path to a value in a document, as a list of object keys and array indices.
 */
export type DocumentPath = (string | number)[];

/**
 * A parsed YAML document, cached by the {@link YamlLocator}.
 */
type ParsedDocument = {
  /**
   * The parsed document.
   */
  readonly document: Document;

  /**
   * The line counter filled when parsing the document, which converts offsets into line and column positions.
   */
  readonly lines: LineCounter;
};

/**
 * Resolves paths to line and column positions in YAML (and JSON) files.
 * Parsed documents are cached for the lifetime of the locator.
 */
export class YamlLocator {
  private readonly documents = new Map<
    string,
    Promise<ParsedDocument | undefined>
  >();

  /**
   * Creates a new {@link YamlLocator}.
   *
   * @param rootPath The absolute path to the workspace root, against which relative paths are resolved.
   */
  constructor(readonly rootPath: string) {}

  /**
   * Returns the parsed document for a file, reading it on the first call.
   *
   * @param relativePath The YAML file, relative to the workspace root.
   * @returns The document and its line counter, or `undefined` if the file cannot be read.
   */
  private load(relativePath: string): Promise<ParsedDocument | undefined> {
    let entry = this.documents.get(relativePath);
    if (!entry) {
      entry = this.parse(relativePath);
      this.documents.set(relativePath, entry);
    }

    return entry;
  }

  /**
   * Reads and parses a file.
   *
   * @param relativePath The YAML file, relative to the workspace root.
   * @returns The document and its line counter, or `undefined` if the file cannot be read.
   */
  private async parse(
    relativePath: string,
  ): Promise<ParsedDocument | undefined> {
    try {
      const content = await readFile(join(this.rootPath, relativePath), 'utf8');
      const lines = new LineCounter();
      const document = parseDocument(content, { lineCounter: lines });
      return { document, lines };
    } catch {
      return undefined;
    }
  }

  /**
   * Locates a construct in a YAML file.
   *
   * @param relativePath The YAML file, relative to the workspace root.
   * @param path The path to the construct in the document.
   * @returns The location, or `undefined` if the file or the construct cannot be found.
   */
  async locate(
    relativePath: string,
    path: DocumentPath,
  ): Promise<GraphSourceLocation | undefined> {
    const entry = await this.load(relativePath);
    if (!entry) {
      return undefined;
    }

    const { document, lines } = entry;
    const node = document.getIn(path, true);
    if (!isNode(node) || !node.range) {
      return undefined;
    }

    let start = node.range[0];
    const end = node.range[1];
    const last = path[path.length - 1];
    const parent =
      path.length > 1
        ? document.getIn(path.slice(0, -1), true)
        : document.contents;
    if (isMap(parent)) {
      const pair = parent.items.find(
        (item) => isScalar(item.key) && String(item.key.value) === String(last),
      );
      if (pair && isNode(pair.key) && pair.key.range) {
        start = pair.key.range[0];
      }
    }

    const from = lines.linePos(start);
    const to = lines.linePos(Math.max(start, end - 1));
    return {
      start: { line: from.line, column: from.col },
      end: { line: to.line, column: to.col },
    };
  }

  /**
   * Builds the origin source of a configuration value: the configuration file declaring it, along with the JSON pointer
   * and location of the value in that file.
   * When the value is not declared by a file (e.g. it is set by a processor), the source is the workspace root.
   *
   * @param context The context from which the configuration is read.
   * @param path The path to the value in the configuration.
   * @returns The {@link GraphOriginSource}.
   */
  async configurationSource(
    context: WorkspaceContext,
    path: DocumentPath,
  ): Promise<GraphOriginSource> {
    // Keys that are not plain identifiers (e.g. `google.spanner`) use the quoted bracket notation, e.g.
    // `serviceContainer.outputs["google.spanner"][0]`.
    const configurationPath = path
      .map((segment, index) => {
        if (typeof segment === 'number') {
          return `[${segment}]`;
        }

        if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
          return index === 0 ? segment : `.${segment}`;
        }

        return `[${JSON.stringify(segment)}]`;
      })
      .join('');
    const source = context.getSource(configurationPath);
    const file =
      source?.rawConfiguration.sourceType ===
        ConfigurationReaderSourceType.File && source.rawConfiguration.source
        ? relative(this.rootPath, source.rawConfiguration.source)
        : undefined;
    return file && source
      ? this.source(file, source.path)
      : { path: '.', pointer: toPointer(path) };
  }

  /**
   * Builds an origin source for a construct in a YAML file, with its JSON pointer and location.
   *
   * @param relativePath The YAML file, relative to the workspace root.
   * @param path The path to the construct in the document. When empty, the source is the whole file.
   * @returns The {@link GraphOriginSource}.
   */
  async source(
    relativePath: string,
    path: DocumentPath = [],
  ): Promise<GraphOriginSource> {
    const location = path.length
      ? await this.locate(relativePath, path)
      : undefined;
    return {
      path: relativePath,
      ...(path.length ? { pointer: toPointer(path) } : {}),
      ...(location ? { location } : {}),
    };
  }
}
