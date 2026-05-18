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

    it('should throw when the title is missing', () => {
      expect(() => parseJsonSchema('type: object', path)).toThrow(
        /missing title/,
      );
    });

    it('should throw when a union has fewer than two non-null variants', () => {
      expect(() =>
        parseJsonSchema('title: Bad\noneOf:\n  - type: string', path),
      ).toThrow(/at least two non-null variants/);
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

    it('should reject oneOf without exactly one non-null variant', () => {
      expect(() =>
        parseJsonSchema(
          `
title: U
type: object
properties:
  name:
    oneOf:
      - type: string
      - type: integer`,
          path,
        ),
      ).toThrow(/exactly one non-null variant/);
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
