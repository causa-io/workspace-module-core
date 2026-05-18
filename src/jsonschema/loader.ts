import {
  REF_BEARING_CAUSA_EXTENSIONS,
  type CausaExtensions,
  type LoadSchemasResult,
  type PropertyType,
  type Schema,
  type SchemaFileReader,
} from '../definitions/index.js';
import { parseJsonSchema } from './parser.js';

/**
 * Options for {@link loadSchemas}.
 */
export type LoadSchemasOptions = {
  /**
   * Reader used to fetch the raw text of every file the loader touches.
   */
  fileReader: SchemaFileReader;
};

/**
 * Load and parse every JSON Schema file at the given absolute paths, then transitively follow `$ref` (and ref-bearing
 * causa extensions) to pull in any referenced files that weren't part of the input set.
 *
 * Parse failures, YAML errors, and read errors are captured in the returned {@link LoadSchemasResult.errors} map rather
 * than aborting the whole load — the caller decides how to surface them.
 *
 * @param paths Absolute paths of the initial schema files to load.
 * @param options Loader options.
 * @returns The fully resolved schemas indexed by path, plus a map of per-file errors.
 */
export async function loadSchemas(
  paths: string[],
  options: LoadSchemasOptions,
): Promise<LoadSchemasResult> {
  const { fileReader } = options;
  const files = new Map<string, Promise<Schema[]>>();

  const scheduleFile = (filePath: string): void => {
    if (!files.has(filePath)) {
      files.set(filePath, processFile(filePath));
    }
  };

  const processFile = async (filePath: string): Promise<Schema[]> => {
    const text = await fileReader(filePath);
    const fileSchemas = parseJsonSchema(text, filePath);
    for (const schema of fileSchemas) {
      for (const ref of collectRefs(schema)) {
        scheduleFile(ref.split('#')[0]);
      }
    }
    return fileSchemas;
  };

  for (const file of paths) {
    scheduleFile(file);
  }

  // Each `processFile` may schedule new files when its refs are discovered. Loop until the map stabilizes —
  // `allSettled` awaits every current promise (already-settled ones re-await instantly) and attaches rejection
  // handlers, so the bare promise type is safe to store.
  let previousSize = -1;
  while (files.size !== previousSize) {
    previousSize = files.size;
    await Promise.allSettled(files.values());
  }

  const schemas: Record<string, Schema> = {};
  const errors: Record<string, Error> = {};
  const entries = [...files.entries()];
  const results = await Promise.allSettled(entries.map(([, p]) => p));
  for (let i = 0; i < entries.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      for (const schema of result.value) {
        schemas[schema.path] = schema;
      }
    } else {
      const { reason } = result;
      errors[entries[i][0]] =
        reason instanceof Error ? reason : new Error(String(reason));
    }
  }

  return { schemas, errors };
}

/**
 * Yield every external reference contained in a {@link Schema} — both `$ref` pointers nested in property types and
 * ref-bearing values in causa extensions.
 *
 * @param schema The schema to walk.
 * @yields Each ref string in source order.
 */
function* collectRefs(schema: Schema): Generator<string> {
  yield* refsFromExtensions(schema.extensions);
  if (schema.kind === 'object') {
    for (const property of schema.properties) {
      yield* refsFromType(property.type);
      yield* refsFromExtensions(property.extensions);
    }
  } else if (schema.kind === 'union') {
    for (const type of schema.types) {
      yield* refsFromType(type);
    }
  }
}

/**
 * Walk a {@link PropertyType} and yield every ref string it contains, recursing into array items and map values.
 *
 * @param type The type to walk.
 * @yields Each ref string encountered.
 */
function* refsFromType(type: PropertyType): Generator<string> {
  switch (type.kind) {
    case 'ref':
      yield type.ref;
      break;
    case 'array':
      yield* refsFromType(type.items);
      break;
    case 'map':
      if (type.items !== 'any') {
        yield* refsFromType(type.items);
      }
      break;
  }
}

/**
 * Yield every ref-bearing value from a {@link CausaExtensions} bag.
 *
 * @param extensions The extensions to walk.
 * @yields Each ref string found under a key in {@link REF_BEARING_CAUSA_EXTENSIONS}.
 */
function* refsFromExtensions(extensions: CausaExtensions): Generator<string> {
  for (const key of REF_BEARING_CAUSA_EXTENSIONS) {
    const value = extensions[key];
    if (typeof value === 'string') {
      yield value;
    }
  }
}
