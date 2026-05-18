import 'jest-extended';
import * as yaml from 'yaml';
import type {
  EnumSchema,
  ObjectSchema,
  UnionSchema,
} from '../definitions/index.js';
import { apply, remove, rename } from './writer.js';

describe('apply', () => {
  const filePath = '/abs/user.yaml';

  it('should write an object schema into empty contents', () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: filePath,
      properties: [
        {
          name: 'id',
          type: { kind: 'primitive', type: 'uuid' },
          nullable: false,
          required: true,
          extensions: {},
        },
      ],
      extensions: {},
      databases: [],
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed).toEqual({
      title: 'User',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' },
      },
      required: ['id'],
    });
  });

  it('should write a nullable property as a oneOf with a null variant', () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: filePath,
      properties: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          nullable: true,
          required: false,
          extensions: {},
        },
      ],
      extensions: {},
      databases: [],
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed.properties.name).toEqual({
      oneOf: [{ type: 'string' }, { type: 'null' }],
    });
  });

  it('should write an enum schema', () => {
    const schema: EnumSchema = {
      kind: 'enum',
      name: 'Color',
      path: filePath,
      type: 'string',
      values: ['red', 'green'],
      extensions: {},
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed).toEqual({
      title: 'Color',
      type: 'string',
      enum: ['red', 'green'],
    });
  });

  it('should write a union schema', () => {
    const schema: UnionSchema = {
      kind: 'union',
      name: 'Either',
      path: filePath,
      types: [
        { kind: 'primitive', type: 'string' },
        { kind: 'primitive', type: 'integer' },
      ],
      extensions: {},
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed).toEqual({
      title: 'Either',
      oneOf: [{ type: 'string' }, { type: 'integer' }],
    });
  });

  it('should write a ref as a relative path within the same directory', () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: filePath,
      properties: [
        {
          name: 'addr',
          type: { kind: 'ref', ref: '/abs/address.yaml' },
          nullable: false,
          required: false,
          extensions: {},
        },
      ],
      extensions: {},
      databases: [],
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed.properties.addr).toEqual({
      oneOf: [{ $ref: 'address.yaml' }],
    });
  });

  it('should write a same-file ref as a fragment-only $ref', () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: filePath,
      properties: [
        {
          name: 'addr',
          type: { kind: 'ref', ref: `${filePath}#/$defs/Address` },
          nullable: false,
          required: false,
          extensions: {},
        },
      ],
      extensions: {},
      databases: [],
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed.properties.addr).toEqual({
      oneOf: [{ $ref: '#/$defs/Address' }],
    });
  });

  it('should rewrite causa extensions ref-bearing values back to relative form', () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: filePath,
      properties: [],
      extensions: { constraintFor: '/abs/other.yaml#/$defs/Foo' },
      databases: [],
    };

    const out = apply('', schema);

    const parsed = yaml.parse(out);
    expect(parsed.causa).toEqual({
      constraintFor: 'other.yaml#/$defs/Foo',
    });
  });

  it('should add a nested schema into $defs without overwriting siblings', () => {
    const contents = `
title: Root
type: object
additionalProperties: false
$defs:
  Existing:
    title: Existing
    type: object`;

    const schema: ObjectSchema = {
      kind: 'object',
      name: 'Added',
      path: `${filePath}#/$defs/Added`,
      properties: [],
      extensions: {},
      databases: [],
    };

    const out = apply(contents, schema);

    const parsed = yaml.parse(out);
    expect(parsed.$defs).toEqual({
      Existing: {
        title: 'Existing',
        type: 'object',
      },
      Added: {
        title: 'Added',
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
    });
  });
});

describe('remove', () => {
  const filePath = '/abs/root.yaml';

  it('should delete a nested schema and prune the empty container', () => {
    const contents = `
title: Root
type: object
$defs:
  Foo:
    title: Foo
    type: object`;

    const out = remove(contents, `${filePath}#/$defs/Foo`);

    const parsed = yaml.parse(out);
    expect(parsed.$defs).toBeUndefined();
  });

  it('should keep other siblings under the container', () => {
    const contents = `
title: Root
type: object
$defs:
  Foo:
    title: Foo
    type: object
  Bar:
    title: Bar
    type: object`;

    const out = remove(contents, `${filePath}#/$defs/Foo`);

    const parsed = yaml.parse(out);
    expect(parsed.$defs).toEqual({
      Bar: { title: 'Bar', type: 'object' },
    });
  });

  it('should be a no-op for top-level paths', () => {
    const contents = 'title: Root\ntype: object\n';

    const out = remove(contents, filePath);

    expect(out).toBe(contents);
  });

  it('should be a no-op when the schema is missing', () => {
    const contents = 'title: Root\ntype: object\n';

    const out = remove(contents, `${filePath}#/$defs/Missing`);

    expect(out).toBe(contents);
  });
});

describe('rename', () => {
  it('should rename the parent key and set the new title on the renamed node', () => {
    const contents = `
title: Root
type: object
$defs:
  Foo:
    title: Foo
    type: object`;

    const out = rename(contents, '/$defs/Foo', '/$defs/Bar');

    const parsed = yaml.parse(out);
    expect(parsed.$defs.Bar).toEqual({ title: 'Bar', type: 'object' });
    expect(parsed.$defs.Foo).toBeUndefined();
  });

  it('should rewrite in-file refs pointing at the old fragment', () => {
    const contents = `
title: Root
type: object
properties:
  foo:
    $ref: "#/$defs/Foo"
$defs:
  Foo:
    title: Foo
    type: object`;

    const out = rename(contents, '/$defs/Foo', '/$defs/Bar');

    const parsed = yaml.parse(out);
    expect(parsed.properties.foo.$ref).toEqual('#/$defs/Bar');
  });

  it('should be a no-op when the source schema does not exist', () => {
    const contents = 'title: Root\ntype: object\n';

    const out = rename(contents, '/$defs/Foo', '/$defs/Bar');

    expect(out).toBe(contents);
  });
});
