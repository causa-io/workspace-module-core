import { FetchingJSONSchemaStore, type JSONSchema } from 'quicktype-core';

/**
 * A JSONSchema store that does not resolve relative URIs, to force the use of absolute paths.
 * Each local schema is stored in {@link AbsoluteIdJsonSchemaStore.absolutePathSchemas}, and the `$id` field of the
 * schema is set to its absolute path to ease reference resolution.
 */
export class AbsoluteIdJsonSchemaStore extends FetchingJSONSchemaStore {
  /**
   * A map of absolute paths to (local) JSON schemas.
   */
  readonly absolutePathSchemas: Record<string, JSONSchema> = {};

  async fetch(address: string): Promise<JSONSchema | undefined> {
    try {
      // The base implementation is used for a valid URL with a scheme.
      new URL(address);
      return super.fetch(address);
    } catch {}

    const isAbsolute = address.startsWith('/');
    if (!isAbsolute) {
      return undefined;
    }

    const schema = await super.fetch(address);

    if (schema) {
      if (typeof schema === 'object') {
        schema.$id = address;
      }
      this.absolutePathSchemas[address] = schema;
    }

    return schema;
  }
}
