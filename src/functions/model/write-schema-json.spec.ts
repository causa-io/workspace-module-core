import type { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import {
  ModelSchemaWrite,
  type ObjectSchema,
} from '../../definitions/index.js';
import { ModelSchemaWriteForJsonSchema } from './write-schema-json.js';

describe('ModelSchemaWriteForJsonSchema', () => {
  let context: WorkspaceContext;

  beforeEach(() => {
    ({ context } = createContext({
      functions: [ModelSchemaWriteForJsonSchema],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
  });

  it('should apply a schema to empty contents', async () => {
    const schema: ObjectSchema = {
      kind: 'object',
      name: 'User',
      path: '/virtual/user.yaml',
      properties: [],
      extensions: {},
      databases: [],
    };

    const result = await context.call(ModelSchemaWrite, {
      contents: '',
      action: { type: 'apply', schema },
    });

    expect(result).toContain('title: User');
    expect(result).toContain('type: object');
  });

  it('should delete a nested schema', async () => {
    const contents = `
title: Root
type: object
$defs:
  Foo:
    title: Foo
    type: object`;

    const result = await context.call(ModelSchemaWrite, {
      contents,
      action: { type: 'delete', path: '/virtual/root.yaml#/$defs/Foo' },
    });

    expect(result).not.toContain('Foo');
    expect(result).not.toContain('$defs');
  });

  it('should rename a nested schema and update local refs', async () => {
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

    const result = await context.call(ModelSchemaWrite, {
      contents,
      action: {
        type: 'rename',
        oldFragment: '/$defs/Foo',
        newFragment: '/$defs/Bar',
      },
    });

    expect(result).toContain('Bar:');
    expect(result).toContain('title: Bar');
    expect(result).toContain('#/$defs/Bar');
    expect(result).not.toContain('#/$defs/Foo');
  });

  it('should throw NoImplementationFoundError when model.schema is not jsonschema', () => {
    const { context: otherContext } = createContext({
      functions: [ModelSchemaWriteForJsonSchema],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'avro' as any },
      },
    });

    expect(() =>
      otherContext.call(ModelSchemaWrite, {
        contents: '',
        action: {
          type: 'apply',
          schema: {
            kind: 'object',
            name: 'X',
            path: '/x.yaml',
            properties: [],
            extensions: {},
            databases: [],
          },
        },
      }),
    ).toThrow(NoImplementationFoundError);
  });
});
