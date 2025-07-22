import { TypeAttributeKind } from 'quicktype-core';

/**
 * Attributes found in the `causa` field of a JSON schema for an object type.
 */
export type CausaObjectAttributes = Record<string, any>;

/**
 * Attributes found in the `causa` field of a JSON schema for a property of an object.
 */
export type CausaPropertyAttributes = Record<string, any>;

/**
 * Causa attributes for a JSONSchema object type.
 */
export type CausaAttribute = {
  /**
   * The URI where the type is defined.
   * This is usually the file path of the JSON schema, with an optional fragment.
   */
  uri: string;

  /**
   * The attributes for the object type itself.
   * This is also available for enums.
   */
  objectAttributes: CausaObjectAttributes;

  /**
   * The attributes for the properties of the object type, where keys are the property names.
   */
  propertiesAttributes: Record<string, CausaPropertyAttributes>;
};

/**
 * The {@link TypeAttributeKind} for the {@link CausaAttribute}.
 */
export class CausaTypeAttributeKind extends TypeAttributeKind<CausaAttribute> {
  constructor() {
    super('causa');
  }

  combine(attributes: CausaAttribute[]): CausaAttribute | undefined {
    // This handles unions of the class (object) type with the `null` type.
    // This is counter-intuitive because `null` is not an object type and won't have any attributes.
    // However tests prove this is needed.
    return attributes[0];
  }

  makeInferred(): CausaAttribute | undefined {
    // Trying to handle the union with a `null` type here does not work, or at least not in all cases.
    return undefined;
  }

  stringify(decorator: CausaAttribute): string {
    return JSON.stringify(decorator);
  }
}

/**
 * The {@link CausaTypeAttributeKind} instance that can be used to retrieve the {@link CausaAttribute} for a type.
 */
export const causaTypeAttributeKind = new CausaTypeAttributeKind();
