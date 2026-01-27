import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';
import { OpenApiGenerateSpecificationForProjectByMerging } from './generate-specification-project.js';

describe('OpenApiGenerateSpecificationForProjectByMerging', () => {
  let rootPath: string;
  let projectPath: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
    projectPath = join(rootPath, 'my-project');
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  function setupContext(configuration: Record<string, any> = {}) {
    ({ context } = createContext({
      rootPath,
      projectPath,
      configuration: {
        workspace: { name: '🏷️' },
        project: { name: 'my-project', type: '🐳', language: '🐦‍⬛' },
        openApi: { specifications: ['**/*.openapi.yaml'] },
        ...configuration,
      },
      functions: [OpenApiGenerateSpecificationForProjectByMerging],
    }));
  }

  async function writeSpec(relativePath: string, spec: object) {
    const fullPath = join(projectPath, relativePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, dump(spec));
  }

  it('should not support when no project is defined', () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        openApi: { specifications: ['*.yaml'] },
      },
      functions: [OpenApiGenerateSpecificationForProjectByMerging],
    });

    expect(() => context.call(OpenApiGenerateSpecification, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should not support when openApi.specifications is not configured', () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { name: 'my-project', type: '🐳', language: '🐦‍⬛' },
      },
      functions: [OpenApiGenerateSpecificationForProjectByMerging],
    });

    expect(() => context.call(OpenApiGenerateSpecification, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should merge multiple specification files', async () => {
    setupContext();
    await writeSpec('a.openapi.yaml', {
      openapi: '3.0.0',
      paths: { '/a': { get: {} } },
    });
    await writeSpec('b.openapi.yaml', {
      openapi: '3.0.0',
      paths: { '/b': { post: {} } },
    });

    const output = join(rootPath, 'openapi.yaml');
    const actualResult = await context.call(OpenApiGenerateSpecification, {
      output,
    });

    expect(actualResult).toEqual(output);
    const actualSpec = load((await readFile(output)).toString());
    expect(actualSpec).toEqual({
      openapi: expect.any(String),
      info: {},
      paths: {
        '/a': { get: {} },
        '/b': { post: {} },
      },
    });
  });

  it('should return the specification as a string when returnSpecification is set', async () => {
    setupContext();
    await writeSpec('a.openapi.yaml', {
      openapi: '3.0.0',
      info: { title: 'A' },
      paths: { '/a': { get: {} } },
    });

    const actualResult = await context.call(OpenApiGenerateSpecification, {
      returnSpecification: true,
    });

    const actualSpec = load(actualResult);
    expect(actualSpec).toEqual({
      openapi: expect.any(String),
      info: { title: 'A' },
      paths: { '/a': { get: {} } },
    });
  });

  it('should apply the global OpenAPI configuration', async () => {
    setupContext({
      openApi: {
        specifications: ['**/*.openapi.yaml'],
        global: { info: { title: '🎉' }, openapi: '3.1.0' },
      },
    });
    await writeSpec('a.openapi.yaml', {
      openapi: '3.0.0',
      info: { title: 'A' },
      paths: { '/a': { get: {} } },
    });

    const output = join(rootPath, 'openapi.yaml');
    await context.call(OpenApiGenerateSpecification, { output });

    const actualSpec = load((await readFile(output)).toString());
    expect(actualSpec).toEqual({
      openapi: '3.1.0',
      info: { title: '🎉' },
      paths: { '/a': { get: {} } },
    });
  });

  it('should only rewrite relative $ref paths based on output location', async () => {
    setupContext();
    await writeSpec('sub/a.openapi.yaml', {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            responses: {
              '200': { $ref: '../schemas/response.yaml#/MyResponse' },
              '201': { $ref: '#/components/schemas/MyResponse' },
              '400': { $ref: 'https://example.com/errors.yaml#/BadRequest' },
              '500': { $ref: '/absolute/path/to/error.yaml' },
            },
          },
        },
      },
    });

    const output = join(rootPath, 'openapi.yaml');
    await context.call(OpenApiGenerateSpecification, { output });

    const actualSpec = load((await readFile(output)).toString()) as any;
    expect(actualSpec.paths['/a'].get.responses).toEqual({
      '200': { $ref: 'my-project/schemas/response.yaml#/MyResponse' },
      '201': { $ref: '#/components/schemas/MyResponse' },
      '400': { $ref: 'https://example.com/errors.yaml#/BadRequest' },
      '500': { $ref: '/absolute/path/to/error.yaml' },
    });
  });
});
