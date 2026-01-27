import { type BaseConfiguration, WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';
import { OpenApiGenerateSpecificationForWorkspace } from './generate-specification-workspace.js';

describe('OpenApiGenerateDocumentationForWorkspace ', () => {
  let rootPath: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
    createContextWithMocks();
  });

  const defaultProjectSpecs: Record<string, object> = {
    project1: {
      openapi: '3.0.0',
      info: { title: 'project1' },
      paths: { '/project1': { get: {} } },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
    project2: {
      openapi: '3.0.0',
      info: { title: 'project2' },
      paths: { '/project2': { get: {} } },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  };

  function createContextWithMocks({
    configuration = {},
    projectPaths = ['project1', 'project2', 'project3'],
    projectSpecs = defaultProjectSpecs,
  }: {
    configuration?: Partial<BaseConfiguration> & Record<string, any>;
    projectPaths?: string[];
    projectSpecs?: Record<string, object>;
  } = {}) {
    ({ context } = createContext({
      rootPath,
      configuration: {
        workspace: { name: '🏷️' },
        openApi: { global: { info: { title: '🎉' } } },
        ...configuration,
      },
      functions: [OpenApiGenerateSpecificationForWorkspace],
    }));

    jest.spyOn(context, 'listProjectPaths').mockResolvedValue(projectPaths);

    jest.spyOn(context, 'clone').mockImplementation(async (options) => {
      const cloned = createContext({
        rootPath: context.rootPath,
        projectPath: options?.workingDirectory,
      });

      const spec = projectSpecs[options?.workingDirectory ?? ''];
      if (spec) {
        registerMockFunction(
          cloned.functionRegistry,
          OpenApiGenerateSpecification,
          async () => JSON.stringify(spec),
        );
      }

      return cloned.context;
    });
  }

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('should not support generation for a specific project', async () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { name: 'my-project', type: '🐳', language: '🐦‍⬛' },
      },
      functions: [OpenApiGenerateSpecificationForWorkspace],
    });

    expect(() => context.call(OpenApiGenerateSpecification, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should generate documentation for all projects in the workspace', async () => {
    const output = join(context.rootPath, 'openapi.yaml');

    const actualResult = await context.call(OpenApiGenerateSpecification, {
      output,
    });

    expect(actualResult).toEqual(output);
    const actualMergedSpecification = load((await readFile(output)).toString());
    expect(actualMergedSpecification).toEqual({
      openapi: expect.any(String),
      info: { title: '🎉' },
      paths: {
        '/project1': { get: {} },
        '/project2': { get: {} },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    });
  });

  it('should use the OpenAPI version from the global configuration', async () => {
    createContextWithMocks({
      configuration: { openApi: { global: { openapi: '3.1.0' } } },
    });
    const output = join(context.rootPath, 'openapi.yaml');

    const actualResult = await context.call(OpenApiGenerateSpecification, {
      output,
    });

    expect(actualResult).toEqual(output);
    const actualMergedSpecification = load((await readFile(output)).toString());
    expect(actualMergedSpecification).toEqual({
      openapi: '3.1.0',
      info: expect.any(Object),
      paths: {
        '/project1': { get: {} },
        '/project2': { get: {} },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    });
  });

  it('should list servers from the environment configuration', async () => {
    createContextWithMocks({
      configuration: {
        openApi: { serversFromEnvironmentConfiguration: 'api.url' },
        environments: {
          dev: {
            name: '🚧',
            configuration: { api: { url: 'http://localhost:8080' } },
          },
          prod: {
            name: '🚀',
            configuration: { api: { url: 'https://api.example.com' } },
          },
        },
      },
    });
    const output = join(context.rootPath, 'openapi.yaml');

    const actualResult = await context.call(OpenApiGenerateSpecification, {
      output,
    });

    expect(actualResult).toEqual(output);
    const actualMergedSpecification = load((await readFile(output)).toString());
    expect(actualMergedSpecification).toEqual({
      openapi: expect.any(String),
      info: expect.any(Object),
      servers: [
        { url: 'http://localhost:8080', description: '🚧' },
        { url: 'https://api.example.com', description: '🚀' },
      ],
      paths: {
        '/project1': { get: {} },
        '/project2': { get: {} },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    });
  });

  it('should override the OpenAPI version when specified', async () => {
    const output = join(context.rootPath, 'openapi.yaml');

    await context.call(OpenApiGenerateSpecification, {
      output,
      version: '1.2.3',
    });

    const actualSpec = load((await readFile(output)).toString()) as any;
    expect(actualSpec.info.version).toEqual('1.2.3');
  });

  it('should bundle external $ref references', async () => {
    const schemasDir = join(rootPath, 'schemas');
    await mkdir(schemasDir, { recursive: true });
    const externalSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    await writeFile(
      join(schemasDir, 'pet.yaml'),
      dump({ Pet: externalSchema }),
    );
    createContextWithMocks({
      projectPaths: ['project1'],
      projectSpecs: {
        project1: {
          openapi: '3.0.0',
          info: { title: 'project1' },
          paths: {
            '/pets': {
              get: {
                responses: {
                  '200': {
                    content: {
                      'application/json': {
                        schema: { $ref: 'schemas/pet.yaml#/Pet' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const output = join(rootPath, 'openapi.yaml');

    const actual = await context.call(OpenApiGenerateSpecification, {
      output,
      returnSpecification: true,
    });

    const actualSpec = load(actual) as OpenAPIV3_1.Document;
    const ref =
      actualSpec.paths?.['/pets']?.get?.responses?.['200'].content[
        'application/json'
      ].schema.$ref;
    expect(ref).toStartWith('#/');
    expect(actualSpec).toHaveProperty(
      ref.replace('#/', '').split('/'),
      externalSchema,
    );
  });
});
