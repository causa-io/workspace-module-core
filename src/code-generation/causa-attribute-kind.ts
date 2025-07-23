import { TypeAttributeKind } from 'quicktype-core';

/**
 * Attributes found in the `causa` field of a JSON schema for an object type.
 */
export type CausaObjectAttributes = {
  /**
   * If defined, the current schema is a constraint for the object referenced (as a URI) by this property.
   */
  constraintFor?: string;

  /**
   * If defined, the current schema is for an event topic that is used to notify about changes to an entity.
   * The entity is sent as the `data` property of the event.
   */
  entityEvent?: boolean;

  /**
   * This should only be present along {@link CausaObjectAttributes.constraintFor}, when the schema referenced by
   * `constraintFor` itself has the {@link CausaObjectAttributes.entityEvent} attribute.
   * Indicates that this constraint schema can only occur when the entity currently validates one of the schemas in the
   * list. Elements in the list can be:
   * - An URI to a schema that defines a `constraintFor` the entity.
   * - An URI to the schema of the entity (if no specific constraint is applicable).
   * - `null`, in case this mutation can be a creation of the entity.
   */
  entityMutationFrom?: (string | null)[];

  /**
   * This should only be present along {@link CausaObjectAttributes.constraintFor}, when the schema referenced by
   * `constraintFor` itself has the {@link CausaObjectAttributes.entityEvent} attribute.
   * Lists the properties that can change in the entity when this event is emitted.
   * `*` can be used to indicate that all properties of the entity can change, or that the entity is created.
   */
  entityPropertyChanges?: string[] | '*';

  [key: string]: any;
};

/**
 * Attributes found in the `causa` field of a JSON schema for a property of an object.
 */
export type CausaPropertyAttributes = {
  /**
   * A reference to an enum schema that narrows down the possible values for this property, without explicitly enforcing
   * the enum values.
   * This can for example be used on a property with a `string` type to allow for the future addition of enum values
   * without breaking existing consumers.
   */
  enumHint?: string;

  [key: string]: any;
};

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
