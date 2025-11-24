import { Ref } from 'quicktype-core';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';
import { causaJsonSchemaAttributeProducer } from './jsonschema-attribute-producer.js';

describe('causaJsonSchemaAttributeProducer', () => {
  const produce = (schema: any) =>
    causaJsonSchemaAttributeProducer(
      schema,
      Ref.parse('/some/file#/$defs/MySchema'),
      new Set(),
      undefined,
    );

  it('should return undefined when the schema is not an object', () => {
    const schema = true;

    const actualResult = produce(schema);

    expect(actualResult).toBeUndefined();
  });

  it('should return undefined when the schema is not an object type nor an enum', () => {
    const schema = { type: 'string' };

    const actualResult = produce(schema);

    expect(actualResult).toBeUndefined();
  });

  it('should return empty maps when the schema does not have a causa attribute', () => {
    const schema = {
      type: 'object',
      properties: { myProperty: { type: 'string' } },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      uri: '/some/file#/$defs/MySchema',
      objectAttributes: {},
      propertiesAttributes: {},
      constProperties: [],
    });
  });

  it('should return the attributes when the object schema has a causa property', () => {
    const schema = {
      type: 'object',
      causa: { myObjectAttribute: '👽' },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      uri: '/some/file#/$defs/MySchema',
      objectAttributes: { myObjectAttribute: '👽' },
      propertiesAttributes: {},
      constProperties: [],
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
        myConstProperty: { type: 'string', const: 'value' },
      },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      uri: '/some/file#/$defs/MySchema',
      objectAttributes: {},
      propertiesAttributes: {
        myProperty: { myPropertyAttribute: '1️⃣' },
        myOtherProperty: { myOtherPropertyAttribute: '2️⃣' },
      },
      constProperties: ['myConstProperty'],
    });
  });

  it('should return the uri for an enum type', () => {
    const schema = {
      type: 'string',
      enum: ['A', 'B', 'C'],
      causa: { myEnumAttribute: '💡' },
    };

    const actualResult = produce(schema);

    expect(actualResult).toEqual({ forType: expect.any(Map) });
    expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
      uri: '/some/file#/$defs/MySchema',
      objectAttributes: { myEnumAttribute: '💡' },
      propertiesAttributes: {},
      constProperties: [],
    });
  });

  it.each([
    { oneOf: [{ type: 'string' }, { type: 'number' }] },
    { anyOf: [{ type: 'string' }, { type: 'number' }] },
    { allOf: [{ type: 'string' }, { type: 'number' }] },
  ])(
    'should return the uri for a combination type (%j)',
    (combinationSchema) => {
      const schema = {
        ...combinationSchema,
        causa: { myCombinationAttribute: '🔀' },
      };

      const actualResult = produce(schema);

      expect(actualResult).toEqual({ forType: expect.any(Map) });
      expect(actualResult?.forType?.get(causaTypeAttributeKind)).toEqual({
        uri: '/some/file#/$defs/MySchema',
        objectAttributes: { myCombinationAttribute: '🔀' },
        propertiesAttributes: {},
        constProperties: [],
      });
    },
  );
});
