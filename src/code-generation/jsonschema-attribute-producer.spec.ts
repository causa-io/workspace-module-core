import { causaTypeAttributeKind } from './causa-attribute-kind.js';
import { causaJsonSchemaAttributeProducer } from './jsonschema-attribute-producer.js';

describe('causaJsonSchemaAttributeProducer', () => {
  const produce = (schema: any) =>
    causaJsonSchemaAttributeProducer(schema, {} as any, new Set(), undefined);

  it('should return undefined when the schema is not an object', () => {
    const schema = true;

    const actualResult = produce(schema);

    expect(actualResult).toBeUndefined();
  });

  it('should return undefined when the schema is not an object type', () => {
    const schema = { type: 'string' };

    const actualResult = produce(schema);

    expect(actualResult).toBeUndefined();
  });

  it('should return undefined when the schema does not have a causa attribute', () => {
    const schema = {
      type: 'object',
      properties: { myProperty: { type: 'string' } },
    };

    const actualResult = produce(schema);

    expect(actualResult).toBeUndefined();
  });

  it('should return the attributes when the object schema has a causa property', () => {
    const schema = {
      type: 'object',
      causa: { myObjectAttribute: '👽' },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      objectAttributes: { myObjectAttribute: '👽' },
      propertiesAttributes: {},
    });
  });

  it('should return the attributes from the object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        myProperty: { type: 'string', causa: { myPropertyAttribute: '1️⃣' } },
        myOtherProperty: {
          type: 'string',
          causa: { myOtherPropertyAttribute: '2️⃣' },
        },
      },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      objectAttributes: {},
      propertiesAttributes: {
        myProperty: { myPropertyAttribute: '1️⃣' },
        myOtherProperty: { myOtherPropertyAttribute: '2️⃣' },
      },
    });
  });
});
