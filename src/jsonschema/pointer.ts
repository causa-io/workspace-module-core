/**
 * Formats a path to a value in a document as a JSON pointer (RFC 6901), escaping `~` and `/` in segments.
 *
 * @param path The object keys and array indices leading to the value.
 * @returns The JSON pointer, e.g. `/$defs/MyState`, or an empty string for the whole document.
 */
export function toPointer(path: readonly (string | number)[]): string {
  return path
    .map((s) => `/${String(s).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

/**
 * Parses a JSON pointer (RFC 6901), e.g. `/$defs/MyState`, into the path to the value in the document.
 * `/` is also accepted for the whole document.
 *
 * @param pointer The JSON pointer.
 * @returns The object keys and array indices leading to the value.
 */
export function fromPointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') {
    return [];
  }

  return pointer
    .replace(/^\//, '')
    .split('/')
    .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/**
 * Splits the path of a schema into its file and the JSON pointer to the schema within the file.
 * A schema path is an absolute file path, followed by a fragment for a nested schema, e.g. `/abs/file.yaml#/$defs/Foo`.
 *
 * @param path The schema path.
 * @returns The file, and the JSON pointer, which is empty for the schema at the root of the file, including when the
 *   fragment is `/`.
 */
export function splitSchemaPath(path: string): {
  file: string;
  pointer: string;
} {
  const hash = path.indexOf('#');
  if (hash < 0) {
    return { file: path, pointer: '' };
  }

  const pointer = path.slice(hash + 1);
  return { file: path.slice(0, hash), pointer: pointer === '/' ? '' : pointer };
}

/**
 * Joins a file and the JSON pointer to a schema within the file into a schema path.
 * The pointer to the whole document (`''` or `/`) is omitted, such that the schema at the root of a file is identified
 * by the file alone.
 *
 * @param file The file.
 * @param pointer The JSON pointer to the schema within the file.
 * @returns The schema path, e.g. `/abs/file.yaml#/$defs/Foo`, or `/abs/file.yaml` for the schema at the root.
 */
export function joinSchemaPath(file: string, pointer: string): string {
  return pointer && pointer !== '/' ? `${file}#${pointer}` : file;
}

/**
 * Appends segments to the JSON pointer of a schema path, escaping them.
 *
 * @param path The schema path, with or without a fragment.
 * @param segments The object keys and array indices to append.
 * @returns The schema path, e.g. `/abs/file.yaml#/properties/address` for `/abs/file.yaml`, `properties`, and
 *   `address`.
 */
export function appendToSchemaPath(
  path: string,
  ...segments: (string | number)[]
): string {
  const { file, pointer } = splitSchemaPath(path);
  return joinSchemaPath(file, `${pointer}${toPointer(segments)}`);
}
