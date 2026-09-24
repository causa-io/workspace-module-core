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
 * @returns The file, and the JSON pointer, which is empty for the schema at the root of the file.
 */
export function splitSchemaPath(path: string): {
  file: string;
  pointer: string;
} {
  const hash = path.indexOf('#');
  return hash < 0
    ? { file: path, pointer: '' }
    : { file: path.slice(0, hash), pointer: path.slice(hash + 1) };
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
  return `${file}#${pointer}${toPointer(segments)}`;
}
