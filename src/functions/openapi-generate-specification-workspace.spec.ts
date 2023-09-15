import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { load } from 'js-yaml';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenApiGenerateSpecification } from '../definitions/index.js';
import { OpenApiGenerateSpecificationForWorkspace } from './openapi-generate-specification-workspace.js';

describe('OpenApiGenerateDocumentationForWorkspace ', () => {
  let context: WorkspaceContext;

  beforeEach(async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
    ({ context } = createContext({
      rootPath,
      configuration: {
        workspace: { name: '🏷️' },
        openApi: { global: { info: { title: '🎉' } } },
      },
      functions: [OpenApiGenerateSpecificationForWorkspace],
    }));

    jest
      .spyOn(context, 'listProjectPaths')
      .mockResolvedValue(['project1', 'project2', 'project3']);

    jest.spyOn(context, 'clone').mockImplementation(async (options) => {
      const cloned = createContext({
        rootPath: context.rootPath,
        projectPath: options?.workingDirectory,
      });

      if (['project1', 'project2'].includes(options?.workingDirectory ?? '')) {
        registerMockFunction(
          cloned.functionRegistry,
          OpenApiGenerateSpecification,
          async (context) =>
            context.projectPath === 'project1'
              ? JSON.stringify({
                  openapi: '3.0.0',
                  info: { title: 'project1' },
                  paths: { '/project1': { get: {} } },
                })
              : JSON.stringify({
                  openapi: '3.0.0',
                  info: { title: 'project2' },
                  paths: { '/project2': { get: {} } },
                }),
        );
      }

      return cloned.context;
    });
  });

  afterEach(async () => {
    await rm(context.rootPath, { recursive: true, force: true });
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
      openapi: '3.0.3',
      info: { title: '🎉' },
      paths: {
        '/project1': { get: {} },
        '/project2': { get: {} },
      },
    });
  });
});
