import type { JSONSchemaAttributeProducer } from 'quicktype-core/dist/input/JSONSchemaInput.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';

/**
 * A {@link JSONSchemaAttributeProducer} that parses the input JSON schema for the `causa` attribute.
 * Only object types are supported. The `causa` fields on the object's properties are also read and added to the
 * returned attribute.
 */
export const causaJsonSchemaAttributeProducer: JSONSchemaAttributeProducer = (
  schema,
) => {
  if (typeof schema !== 'object' || schema.type !== 'object') {
    return undefined;
  }

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

  if (
    Object.keys(objectAttributes).length === 0 &&
    Object.keys(propertiesAttributes).length === 0
  ) {
    return undefined;
  }

  return {
    forType: causaTypeAttributeKind.makeAttributes({
      objectAttributes,
      propertiesAttributes,
    }),
  };
};
