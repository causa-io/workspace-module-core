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
   * The attributes for the object type itself.
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

  combine(): CausaAttribute | undefined {
    return undefined;
  }

  makeInferred(): CausaAttribute | undefined {
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
