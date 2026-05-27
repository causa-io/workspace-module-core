import 'jest-extended';
import { parseJsonSchema } from './parser.js';

describe('parseJsonSchema', () => {
  const path = '/abs/file.yaml';

  describe('top-level shapes', () => {
    it('should parse an object schema with no properties', () => {
      const [schema] = parseJsonSchema('title: User\ntype: object', path);

      expect(schema).toEqual({
        kind: 'object',
        name: 'User',
        path,
        properties: [],
        additionalProperties: true,
        extensions: {},
        databases: [],
      });
    });

    it('should parse a string enum', () => {
      const [schema] = parseJsonSchema(
        'title: Color\ntype: string\nenum: [red, green, blue]',
        path,
      );

      expect(schema).toEqual({
        kind: 'enum',
        name: 'Color',
        path,
        type: 'string',
        values: ['red', 'green', 'blue'],
        extensions: {},
      });
    });

    it('should infer integer enum type when type is omitted', () => {
      const [schema] = parseJsonSchema('title: Level\nenum: [1, 2, 3]', path);

      expect(schema).toMatchObject({
        kind: 'enum',
        type: 'integer',
        values: [1, 2, 3],
      });
    });

    it('should parse a union with at least two non-null variants', () => {
      const [schema] = parseJsonSchema(
        `
title: Either
oneOf:
  - type: string
  - type: integer`,
        path,
      );

      expect(schema).toMatchObject({
        kind: 'union',
        name: 'Either',
        combiner: 'oneOf',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
    });

    it('should parse a top-level anyOf union', () => {
      const [schema] = parseJsonSchema(
        `
title: Either
anyOf:
  - type: string
  - type: integer`,
        path,
      );

      expect(schema).toMatchObject({
        kind: 'union',
        name: 'Either',
        combiner: 'anyOf',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
    });

    it('should parse a top-level nullable anyOf union with a single non-null variant', () => {
      const [schema] = parseJsonSchema(
        `
title: Maybe
anyOf:
  - type: string
  - type: "null"`,
        path,
      );

      expect(schema).toMatchObject({
        kind: 'union',
        name: 'Maybe',
        combiner: 'anyOf',
        types: [{ kind: 'primitive', type: 'string' }, { kind: 'null' }],
      });
    });

    it('should parse a top-level union declared with an array `type`', () => {
      const [schema] = parseJsonSchema(
        `
title: Either
type: [string, integer]
description: A scalar.`,
        path,
      );

      expect(schema).toMatchObject({
        kind: 'union',
        name: 'Either',
        description: 'A scalar.',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
    });

    it('should throw when the document is not an object', () => {
      expect(() => parseJsonSchema('- not an object', path)).toThrow(
        /document is not an object/,
      );
    });

    it('should parse a top-level nullable union with a single non-null variant', () => {
      const [schema] = parseJsonSchema(
        `
title: Maybe
oneOf:
  - type: string
  - type: "null"`,
        path,
      );

      expect(schema).toMatchObject({
        kind: 'union',
        name: 'Maybe',
        types: [{ kind: 'primitive', type: 'string' }, { kind: 'null' }],
      });
    });

    it('should preserve explicit additionalProperties: false on an object schema', () => {
      const [schema] = parseJsonSchema(
        `
title: User
type: object
additionalProperties: false
properties:
  id:
    type: string`,
        path,
      );

      expect((schema as any).additionalProperties).toBe(false);
    });

    it('should resolve a typed additionalProperties schema on an object schema', () => {
      const [schema] = parseJsonSchema(
        `
title: User
type: object
additionalProperties:
  type: integer
properties:
  id:
    type: string`,
        path,
      );

      expect((schema as any).additionalProperties).toEqual({
        kind: 'primitive',
        type: 'integer',
      });
    });

    it('should extract an inline schema declared in an object schema additionalProperties', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
additionalProperties:
  title: Extra
  type: object
  properties:
    value:
      type: string
properties:
  id:
    type: string`,
        path,
      );

      const inlinePointer = `${path}#/additionalProperties`;
      const inline = schemas.find((s) => s.name === 'Extra');
      expect(inline).toMatchObject({ kind: 'object', path: inlinePointer });
      expect((schemas[0] as any).additionalProperties).toEqual({
        kind: 'ref',
        ref: inlinePointer,
      });
    });

    it('should fall back to `${schemaName}Value` for an untitled inline additionalProperties schema', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
additionalProperties:
  type: object
  properties:
    value:
      type: string
properties:
  id:
    type: string`,
        path,
      );

      const inline = schemas.find(
        (s) => s.path === `${path}#/additionalProperties`,
      );
      expect(inline).toMatchObject({ kind: 'object', name: 'RootValue' });
    });
  });

  describe('properties', () => {
    it('should parse primitives and respect required', () => {
      const [schema] = parseJsonSchema(
        `
title: User
type: object
required: [id]
properties:
  id:
    type: string
    format: uuid
  name:
    type: string`,
        path,
      );

      expect(schema).toMatchObject({
        properties: [
          {
            name: 'id',
            type: { kind: 'primitive', type: 'uuid' },
            required: true,
            nullable: false,
          },
          {
            name: 'name',
            type: { kind: 'primitive', type: 'string' },
            required: false,
            nullable: false,
          },
        ],
      });
    });

    it('should ignore an unrecognized format and fall back to the bare type', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  email:
    type: string
    format: email`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'primitive',
        type: 'string',
      });
    });

    it('should resolve datetime format', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  at:
    type: string
    format: date-time`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'primitive',
        type: 'datetime',
      });
    });

    it('should mark a property nullable via oneOf with null variant', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  name:
    oneOf:
      - type: string
      - type: "null"`,
        path,
      );

      expect((schema as any).properties[0]).toMatchObject({
        type: { kind: 'primitive', type: 'string' },
        nullable: true,
      });
    });

    it('should mark a property nullable via an array `type` with a null entry', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  name:
    type: [string, "null"]`,
        path,
      );

      expect((schema as any).properties[0]).toMatchObject({
        type: { kind: 'primitive', type: 'string' },
        nullable: true,
      });
    });

    it('should extract an inline object schema declared with an array `type`', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    type: [object, "null"]
    title: Address
    properties:
      street:
        type: string`,
        path,
      );

      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object' });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: (inline as any).path },
        nullable: true,
      });
    });

    it('should reject combining an array `type` with `oneOf`', () => {
      expect(() =>
        parseJsonSchema(
          `
title: U
type: object
properties:
  name:
    type: [string, "null"]
    oneOf:
      - type: string
      - type: "null"`,
          path,
        ),
      ).toThrow(/cannot combine an array .type. with .oneOf. or .anyOf./);
    });

    it('should parse array with nullable items', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  tags:
    type: array
    items:
      oneOf:
        - type: string
        - type: "null"`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'array',
        items: { kind: 'primitive', type: 'string' },
        itemNullable: true,
      });
    });

    it('should parse array items declared with a nullable array `type`', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  tags:
    type: array
    items:
      type: [string, "null"]`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'array',
        items: { kind: 'primitive', type: 'string' },
        itemNullable: true,
      });
    });

    it('should parse a map with typed values', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  flags:
    type: object
    additionalProperties:
      type: boolean`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'map',
        items: { kind: 'primitive', type: 'boolean' },
      });
    });

    it('should treat type: object with no properties and no additionalProperties as a map of any', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  bag:
    type: object`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'map',
        items: 'any',
      });
    });

    it('should parse a map with any values when additionalProperties is true', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  bag:
    type: object
    additionalProperties: true`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'map',
        items: 'any',
      });
    });

    it('should reject additionalProperties: false', () => {
      expect(() =>
        parseJsonSchema(
          `
title: U
type: object
properties:
  bag:
    type: object
    additionalProperties: false`,
          path,
        ),
      ).toThrow(/additionalProperties: false/);
    });

    it('should parse const property values', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  kind:
    type: string
    const: user`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'const',
        type: 'string',
        value: 'user',
      });
    });
  });

  describe('refs', () => {
    it('should resolve a fragment-only ref to an absolute path', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  address:
    $ref: "#/$defs/Address"`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'ref',
        ref: `${path}#/$defs/Address`,
      });
    });

    it('should resolve a relative file ref against the source directory', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  address:
    $ref: "./address.yaml"`,
        path,
      );

      expect((schema as any).properties[0].type).toEqual({
        kind: 'ref',
        ref: '/abs/address.yaml',
      });
    });
  });

  describe('nested and inline schemas', () => {
    it('should emit a separate schema for each $defs entry', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
$defs:
  Address:
    title: Address
    type: object`,
        path,
      );

      expect(schemas).toHaveLength(2);
      const address = schemas.find((s) => s.name === 'Address');
      expect(address).toMatchObject({
        path: `${path}#/$defs/Address`,
      });
    });

    it('should extract an inline union declared with oneOf on a property', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    title: Value
    oneOf:
      - type: string
      - type: integer`,
        path,
      );

      const inlinePointer = `${path}#/properties/value`;
      const union = schemas.find((s) => s.name === 'Value');
      expect(union).toMatchObject({
        kind: 'union',
        path: inlinePointer,
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: false,
      });
    });

    it('should extract a inline union with null', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    oneOf:
      - type: string
      - type: integer
      - type: "null"`,
        path,
      );

      const inlinePointer = `${path}#/properties/value`;
      const union = schemas.find((s) => s.path === inlinePointer);
      expect(union).toMatchObject({
        kind: 'union',
        name: 'value',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
          { kind: 'null' },
        ],
      });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: false,
      });
    });

    it('should extract an inline union declared with an array `type` on a property', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    type: [string, integer]`,
        path,
      );

      const inlinePointer = `${path}#/properties/value`;
      const union = schemas.find((s) => s.path === inlinePointer);
      expect(union).toMatchObject({
        kind: 'union',
        name: 'value',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: false,
      });
    });

    it('should extract a nullable inline object schema with the oneOf-suffixed pointer', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    oneOf:
      - title: Address
        type: object
        properties:
          street:
            type: string
      - type: "null"`,
        path,
      );

      const inlinePointer = `${path}#/properties/address/oneOf/0`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ path: inlinePointer });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: true,
      });
    });

    it('should extract a nullable inline enum schema with the oneOf-suffixed pointer', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  status:
    oneOf:
      - type: "null"
      - title: Status
        type: string
        enum: [active, archived]`,
        path,
      );

      const inlinePointer = `${path}#/properties/status/oneOf/1`;
      const inline = schemas.find((s) => s.name === 'Status');
      expect(inline).toMatchObject({
        kind: 'enum',
        type: 'string',
        values: ['active', 'archived'],
        path: inlinePointer,
      });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: true,
      });
    });

    it('should extract an inline object schema declared inside array items', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  addresses:
    type: array
    items:
      title: Address
      type: object
      properties:
        street:
          type: string`,
        path,
      );

      const inlinePointer = `${path}#/properties/addresses/items`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object', path: inlinePointer });
      expect((schemas[0] as any).properties[0].type).toEqual({
        kind: 'array',
        items: { kind: 'ref', ref: inlinePointer },
        itemNullable: false,
      });
    });

    it('should extract a nullable inline object schema declared inside array items', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  addresses:
    type: array
    items:
      type: [object, "null"]
      title: Address
      properties:
        street:
          type: string`,
        path,
      );

      const inlinePointer = `${path}#/properties/addresses/items/oneOf/0`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object', path: inlinePointer });
      expect((schemas[0] as any).properties[0].type).toEqual({
        kind: 'array',
        items: { kind: 'ref', ref: inlinePointer },
        itemNullable: true,
      });
    });

    it('should extract an inline enum schema declared inside array items', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  statuses:
    type: array
    items:
      title: Status
      type: string
      enum: [active, archived]`,
        path,
      );

      const inlinePointer = `${path}#/properties/statuses/items`;
      const inline = schemas.find((s) => s.name === 'Status');
      expect(inline).toMatchObject({
        kind: 'enum',
        type: 'string',
        values: ['active', 'archived'],
        path: inlinePointer,
      });
    });

    it('should extract an inline union declared inside array items', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  values:
    type: array
    items:
      title: Value
      oneOf:
        - type: string
        - type: integer`,
        path,
      );

      const inlinePointer = `${path}#/properties/values/items`;
      const union = schemas.find((s) => s.name === 'Value');
      expect(union).toMatchObject({ kind: 'union', path: inlinePointer });
    });

    it('should fall back to `${propertyName}Item` for an untitled inline schema in array items', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  addresses:
    type: array
    items:
      type: object
      properties:
        street:
          type: string`,
        path,
      );

      const inline = schemas.find(
        (s) => s.path === `${path}#/properties/addresses/items`,
      );
      expect(inline).toMatchObject({ kind: 'object', name: 'addressesItem' });
    });

    it('should extract an inline object schema declared inside additionalProperties', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  byId:
    type: object
    additionalProperties:
      title: Entry
      type: object
      properties:
        name:
          type: string`,
        path,
      );

      const inlinePointer = `${path}#/properties/byId/additionalProperties`;
      const inline = schemas.find((s) => s.name === 'Entry');
      expect(inline).toMatchObject({ kind: 'object', path: inlinePointer });
      expect((schemas[0] as any).properties[0].type).toEqual({
        kind: 'map',
        items: { kind: 'ref', ref: inlinePointer },
      });
    });

    it('should fall back to `${propertyName}Value` for an untitled inline schema in additionalProperties', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  byId:
    type: object
    additionalProperties:
      type: object
      properties:
        name:
          type: string`,
        path,
      );

      const inline = schemas.find(
        (s) => s.path === `${path}#/properties/byId/additionalProperties`,
      );
      expect(inline).toMatchObject({ kind: 'object', name: 'byIdValue' });
    });

    it('should extract an inline anyOf union declared on a property with the anyOf-suffixed pointer', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    title: Value
    anyOf:
      - type: string
      - type: integer`,
        path,
      );

      const unionPointer = `${path}#/properties/value`;
      const union = schemas.find((s) => s.name === 'Value');
      expect(union).toMatchObject({
        kind: 'union',
        combiner: 'anyOf',
        path: unionPointer,
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'integer' },
        ],
      });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: unionPointer },
        nullable: false,
      });
    });

    it('should unwrap a property anyOf with a single non-null variant as nullable', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
properties:
  name:
    anyOf:
      - type: string
      - type: "null"`,
        path,
      );

      expect((schema as any).properties[0]).toMatchObject({
        type: { kind: 'primitive', type: 'string' },
        nullable: true,
      });
    });

    it('should extract a nullable inline object schema with the anyOf-suffixed pointer', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    anyOf:
      - title: Address
        type: object
        properties:
          street:
            type: string
      - type: "null"`,
        path,
      );

      const inlinePointer = `${path}#/properties/address/anyOf/0`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object', path: inlinePointer });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: inlinePointer },
        nullable: true,
      });
    });

    it('should extract an inline object variant inside a top-level anyOf union', () => {
      const schemas = parseJsonSchema(
        `
title: Either
anyOf:
  - title: Address
    type: object
    properties:
      street:
        type: string
  - type: string`,
        path,
      );

      const variantPointer = `${path}#/anyOf/0`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object', path: variantPointer });
      expect(schemas[0]).toMatchObject({
        kind: 'union',
        combiner: 'anyOf',
        types: [
          { kind: 'ref', ref: variantPointer },
          { kind: 'primitive', type: 'string' },
        ],
      });
    });

    it('should reject combining oneOf and anyOf on the same node', () => {
      expect(() =>
        parseJsonSchema(
          `
title: Either
oneOf:
  - type: string
  - type: integer
anyOf:
  - type: boolean`,
          path,
        ),
      ).toThrow(/cannot combine .oneOf. and .anyOf./);
    });

    it('should reject combining an array `type` with `anyOf`', () => {
      expect(() =>
        parseJsonSchema(
          `
title: U
type: object
properties:
  name:
    type: [string, "null"]
    anyOf:
      - type: string
      - type: "null"`,
          path,
        ),
      ).toThrow(/cannot combine an array .type. with .oneOf. or .anyOf./);
    });

    it('should extract an inline object variant inside a top-level union', () => {
      const schemas = parseJsonSchema(
        `
title: Either
oneOf:
  - title: Address
    type: object
    properties:
      street:
        type: string
  - type: string`,
        path,
      );

      const variantPointer = `${path}#/oneOf/0`;
      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({ kind: 'object', path: variantPointer });
      expect(schemas[0]).toMatchObject({
        kind: 'union',
        name: 'Either',
        types: [
          { kind: 'ref', ref: variantPointer },
          { kind: 'primitive', type: 'string' },
        ],
      });
    });

    it('should extract an inline enum variant inside a top-level union', () => {
      const schemas = parseJsonSchema(
        `
title: Either
oneOf:
  - type: integer
  - title: Status
    type: string
    enum: [active, archived]`,
        path,
      );

      const variantPointer = `${path}#/oneOf/1`;
      const inline = schemas.find((s) => s.name === 'Status');
      expect(inline).toMatchObject({
        kind: 'enum',
        type: 'string',
        values: ['active', 'archived'],
        path: variantPointer,
      });
      expect((schemas[0] as any).types).toEqual([
        { kind: 'primitive', type: 'integer' },
        { kind: 'ref', ref: variantPointer },
      ]);
    });

    it('should extract an inline object variant inside a property union', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    title: Value
    oneOf:
      - title: Address
        type: object
        properties:
          street:
            type: string
      - type: string`,
        path,
      );

      const unionPointer = `${path}#/properties/value`;
      const variantPointer = `${unionPointer}/oneOf/0`;
      const union = schemas.find((s) => s.name === 'Value');
      const inline = schemas.find((s) => s.name === 'Address');
      expect(union).toMatchObject({
        kind: 'union',
        path: unionPointer,
        types: [
          { kind: 'ref', ref: variantPointer },
          { kind: 'primitive', type: 'string' },
        ],
      });
      expect(inline).toMatchObject({ kind: 'object', path: variantPointer });
      expect((schemas[0] as any).properties[0]).toMatchObject({
        type: { kind: 'ref', ref: unionPointer },
      });
    });

    it('should recursively extract inline schemas nested inside union variants', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  value:
    title: Value
    oneOf:
      - title: Wrapper
        type: object
        properties:
          inner:
            title: Inner
            oneOf:
              - title: Detail
                type: object
                properties:
                  label:
                    type: string
              - type: integer
      - type: string`,
        path,
      );

      const valuePointer = `${path}#/properties/value`;
      const wrapperPointer = `${valuePointer}/oneOf/0`;
      const innerPointer = `${wrapperPointer}/properties/inner`;
      const detailPointer = `${innerPointer}/oneOf/0`;

      const value = schemas.find((s) => s.name === 'Value');
      const wrapper = schemas.find((s) => s.name === 'Wrapper');
      const inner = schemas.find((s) => s.name === 'Inner');
      const detail = schemas.find((s) => s.name === 'Detail');

      expect(value).toMatchObject({
        kind: 'union',
        path: valuePointer,
        types: [
          { kind: 'ref', ref: wrapperPointer },
          { kind: 'primitive', type: 'string' },
        ],
      });
      expect(wrapper).toMatchObject({
        kind: 'object',
        path: wrapperPointer,
        properties: [
          {
            name: 'inner',
            type: { kind: 'ref', ref: innerPointer },
          },
        ],
      });
      expect(inner).toMatchObject({
        kind: 'union',
        path: innerPointer,
        types: [
          { kind: 'ref', ref: detailPointer },
          { kind: 'primitive', type: 'integer' },
        ],
      });
      expect(detail).toMatchObject({
        kind: 'object',
        path: detailPointer,
        properties: [
          {
            name: 'label',
            type: { kind: 'primitive', type: 'string' },
          },
        ],
      });
    });

    it('should fall back to `${unionName}Variant${i}` for an untitled inline variant', () => {
      const schemas = parseJsonSchema(
        `
title: Either
oneOf:
  - type: object
    properties:
      street:
        type: string
  - type: string`,
        path,
      );

      const inline = schemas.find((s) => s.path === `${path}#/oneOf/0`);
      expect(inline).toMatchObject({
        kind: 'object',
        name: 'EitherVariant0',
      });
    });

    it('should extract inline object schemas with their own path', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    title: Address
    type: object
    properties:
      street:
        type: string`,
        path,
      );

      const inline = schemas.find((s) => s.name === 'Address');
      expect(inline).toMatchObject({
        path: `${path}#/properties/address`,
      });
      expect((schemas[0] as any).properties[0].type).toEqual({
        kind: 'ref',
        ref: `${path}#/properties/address`,
      });
    });
  });

  describe('title fallbacks', () => {
    it('should fall back to the filename without extension for the top-level schema', () => {
      const [schema] = parseJsonSchema('type: object', path);

      expect(schema).toMatchObject({ kind: 'object', name: 'file', path });
    });

    it('should fall back to the entry key for $defs schemas', () => {
      const schemas = parseJsonSchema(
        `
type: object
$defs:
  Address:
    type: object`,
        path,
      );

      const address = schemas.find((s) => s.path === `${path}#/$defs/Address`);
      expect(address).toMatchObject({ name: 'Address' });
    });

    it('should fall back to the property name for inline object schemas', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    type: object
    properties:
      street:
        type: string`,
        path,
      );

      const inline = schemas.find(
        (s) => s.path === `${path}#/properties/address`,
      );
      expect(inline).toMatchObject({ kind: 'object', name: 'address' });
    });

    it('should fall back to the property name for inline schemas nested in a nullable oneOf', () => {
      const schemas = parseJsonSchema(
        `
title: Root
type: object
properties:
  address:
    oneOf:
      - type: object
        properties:
          street:
            type: string
      - type: "null"`,
        path,
      );

      const inline = schemas.find(
        (s) => s.path === `${path}#/properties/address/oneOf/0`,
      );
      expect(inline).toMatchObject({ kind: 'object', name: 'address' });
    });
  });

  describe('causa extensions', () => {
    it('should normalize ref-bearing extensions to absolute paths', () => {
      const [schema] = parseJsonSchema(
        `
title: U
type: object
causa:
  constraintFor: "./other.yaml#/$defs/Foo"
  custom: untouched`,
        path,
      );

      expect(schema.extensions).toEqual({
        constraintFor: '/abs/other.yaml#/$defs/Foo',
        custom: 'untouched',
      });
    });
  });

  it('should leave databases empty', () => {
    const [schema] = parseJsonSchema(
      `
title: U
type: object
causa:
  googleSpannerTable:
    name: users
    primaryKey: [id]`,
      path,
    );

    expect(schema).toMatchObject({ kind: 'object', databases: [] });
  });
});
