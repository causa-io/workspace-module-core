import type { WorkspaceContext } from '@causa/workspace';
import type { FunctionRegistry } from '@causa/workspace/function-registry';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { join, resolve } from 'path';
import {
  ModelSchemaExtractDatabase,
  ModelSchemaParse,
  type SchemaFileReader,
} from '../../definitions/index.js';
import { ModelSchemaParseForJsonSchema } from './parse-schemas-json.js';

describe('ModelSchemaParseForJsonSchema', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = resolve(await mkdtemp('causa-tests-'));
    ({ context, functionRegistry } = createContext({
      functions: [ModelSchemaParseForJsonSchema],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should parse schemas using the provided file reader', async () => {
    const path = '/virtual/user.yaml';
    const fileReader: SchemaFileReader = async () =>
      `title: User\ntype: object`;

    const result = await context.call(ModelSchemaParse, {
      paths: [path],
      fileReader,
    });

    expect(result.errors).toEqual({});
    expect(result.schemas[path]).toMatchObject({
      kind: 'object',
      name: 'User',
      path,
      properties: [],
      databases: [],
    });
  });

  it('should read from disk when no file reader is provided', async () => {
    const path = join(tempDir, 'user.yaml');
    await writeFile(path, `title: User\ntype: object`);

    const result = await context.call(ModelSchemaParse, { paths: [path] });

    expect(result.schemas[path]).toMatchObject({ kind: 'object' });
  });

  it('should collect bindings returned by ModelSchemaExtractDatabase implementations', async () => {
    registerMockFunction(
      functionRegistry,
      ModelSchemaExtractDatabase,
      (_, { schema }) => ({
        engine: 'fake.engine',
        table: schema.name,
      }),
    );

    const path = '/virtual/user.yaml';
    const fileReader: SchemaFileReader = async () =>
      `title: User\ntype: object`;

    const result = await context.call(ModelSchemaParse, {
      paths: [path],
      fileReader,
    });

    expect(result.schemas[path]).toMatchObject({
      databases: [{ engine: 'fake.engine', table: 'User' }],
    });
  });

  it('should capture per-file parse failures rather than aborting', async () => {
    const okPath = '/virtual/ok.yaml';
    const badPath = '/virtual/bad.yaml';
    const fileReader: SchemaFileReader = async (p) =>
      p === okPath ? 'title: Ok\ntype: object' : 'not: a schema';

    const result = await context.call(ModelSchemaParse, {
      paths: [okPath, badPath],
      fileReader,
    });

    expect(result.schemas[okPath]).toMatchObject({ kind: 'object' });
    expect(result.errors[badPath]).toBeInstanceOf(Error);
  });

  it('should throw NoImplementationFoundError when model.schema is not jsonschema', () => {
    const { context: otherContext } = createContext({
      functions: [ModelSchemaParseForJsonSchema],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'avro' as any },
      },
    });

    expect(() => otherContext.call(ModelSchemaParse, { paths: [] })).toThrow(
      NoImplementationFoundError,
    );
  });
});
