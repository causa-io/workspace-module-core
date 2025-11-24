import type {
  JSONSchemaAttributeProducer,
  Ref,
} from 'quicktype-core/dist/input/JSONSchemaInput.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';

/**
 * Normalizes a JSONSchema URI.
 * Trailing empty fragments are removed, and the fragment is ensured to start with a `/`.
 *
 * @param ref The {@link Ref} to normalize.
 * @returns The normalized URI string.
 */
function normalizeUri(ref: Ref): string {
  const pathAndFragment = ref.toString().split('#', 2);
  if (!pathAndFragment[1]) {
    return pathAndFragment[0];
  }

  const fragmentHasSlash = pathAndFragment[1].startsWith('/');
  return pathAndFragment.join(fragmentHasSlash ? '#' : '#/');
}

/**
 * A {@link JSONSchemaAttributeProducer} that parses the input JSON schema for the `causa` attribute.
 * Only object types, combined types, and enums are supported. The `causa` fields on the object's properties are also
 * read and added to the returned attribute.
 */
export const causaJsonSchemaAttributeProducer: JSONSchemaAttributeProducer = (
  schema,
  ref,
) => {
  if (typeof schema !== 'object') {
    return undefined;
  }

  const isEnum = Array.isArray(schema.enum);
  const isObject = schema.type === 'object';
  // If the schema is a non-trivial combination of types, it may be emitted as its own type, in which case we want to
  // extract the attributes (especially the URI). Combinations used for nullability only are ignored.
  const isCombination = [schema.oneOf, schema.anyOf, schema.allOf].some(
    (c) => Array.isArray(c) && c.filter((s) => s.type !== 'null').length > 1,
  );
  if (!isEnum && !isObject && !isCombination) {
    return undefined;
  }

  const uri = normalizeUri(ref);
  const objectAttributes: Record<string, string> =
    'causa' in schema && typeof schema.causa === 'object' ? schema.causa : {};
  const propertiesAttributes: Record<string, Record<string, string>> = {};
  const constProperties: string[] = [];

  const properties: Record<string, any> =
    'properties' in schema && typeof schema.properties === 'object'
      ? schema.properties
      : {};
  Object.entries(properties).forEach(([propertyName, propertySchema]) => {
    if (typeof propertySchema !== 'object') {
      return;
    }

    if ('const' in propertySchema) {
      constProperties.push(propertyName);
    }

    if ('causa' in propertySchema && typeof propertySchema.causa === 'object') {
      propertiesAttributes[propertyName] = propertySchema.causa;
    }
  });

  return {
    forType: causaTypeAttributeKind.makeAttributes({
      uri,
      objectAttributes,
      propertiesAttributes,
      constProperties,
    }),
  };
};
