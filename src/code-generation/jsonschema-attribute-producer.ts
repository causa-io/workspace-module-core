import type { JSONSchemaAttributeProducer } from 'quicktype-core/dist/input/JSONSchemaInput.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';

/**
 * A {@link JSONSchemaAttributeProducer} that parses the input JSON schema for the `causa` attribute.
 * Only object types and enums are supported. The `causa` fields on the object's properties are also read and added to the
 * returned attribute.
 */
export const causaJsonSchemaAttributeProducer: JSONSchemaAttributeProducer = (
  schema,
  ref,
) => {
  if (typeof schema !== 'object') {
    return undefined;
  }

  if (!Array.isArray(schema.enum) && schema.type !== 'object') {
    return undefined;
  }

  const uri = ref.toString();
  const objectAttributes: Record<string, string> =
    'causa' in schema && typeof schema.causa === 'object' ? schema.causa : {};
  const propertiesAttributes: Record<string, Record<string, string>> = {};

  const properties: Record<string, any> =
    'properties' in schema && typeof schema.properties === 'object'
      ? schema.properties
      : {};
  Object.entries(properties).forEach(([propertyName, propertySchema]) => {
    if (
      typeof propertySchema !== 'object' ||
      !('causa' in propertySchema) ||
      typeof propertySchema.causa !== 'object'
    ) {
      return;
    }

    propertiesAttributes[propertyName] = propertySchema.causa;
  });

  return {
    forType: causaTypeAttributeKind.makeAttributes({
      uri,
      objectAttributes,
      propertiesAttributes,
    }),
  };
};
