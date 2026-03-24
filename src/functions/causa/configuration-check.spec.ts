import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { dump } from 'js-yaml';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  CausaListConfigurationSchemas,
  ConfigurationCheck,
  ConfigurationCheckError,
} from '../../definitions/index.js';
import { ConfigurationCheckForAll } from './configuration-check.js';

describe('ConfigurationCheckForAll', () => {
  let tmpDir: string;
  let schemaPath: string;
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp(join(tmpdir(), 'causa-')));
    schemaPath = join(tmpDir, 'schema.yaml');
    await writeFile(
      schemaPath,
      dump({
        type: 'object',
        properties: {
          project: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              language: { type: 'string' },
            },
          },
        },
      }),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function setupContext(
    configuration: Record<string, unknown>,
    schemaPaths: string[] = [schemaPath],
  ) {
    ({ context, functionRegistry } = createContext({
      configuration: { workspace: { name: 'test' }, ...configuration },
      functions: [ConfigurationCheckForAll],
    }));
    registerMockFunction(
      functionRegistry,
      CausaListConfigurationSchemas,
      async () => schemaPaths,
    );
  }

  it('should not throw when the configuration is valid', async () => {
    setupContext({ project: { name: 'my-project' } });

    await context.call(ConfigurationCheck, {});
  });

  it('should throw a ConfigurationCheckError when the configuration is invalid', async () => {
    setupContext({ project: { name: 123, language: true } });

    const actualError = await context
      .call(ConfigurationCheck, {})
      .catch((e) => e);

    expect(actualError).toBeInstanceOf(ConfigurationCheckError);
    expect(
      (actualError as ConfigurationCheckError).errors,
    ).toIncludeSameMembers([
      { path: '/project/name', message: expect.any(String) },
      { path: '/project/language', message: expect.any(String) },
    ]);
  });

  it('should render templates before validating when the render option is set', async () => {
    setupContext({
      project: {
        name: 'my-project',
        language: { $format: "${ configuration('project.name') }" },
      },
    });

    await context.call(ConfigurationCheck, { render: true });
  });

  it('should not render templates by default', async () => {
    setupContext({
      project: {
        name: 'my-project',
        language: { $format: "${ configuration('project.name') }" },
      },
    });

    const actualPromise = context.call(ConfigurationCheck, {});

    await expect(actualPromise).rejects.toBeInstanceOf(ConfigurationCheckError);
  });

  it('should throw when a project has invalid configuration with the projects option', async () => {
    setupContext({});

    const { context: invalidProjectContext } = createContext({
      configuration: {
        workspace: { name: 'test' },
        project: { name: 123 as any },
      },
      functions: [ConfigurationCheckForAll],
    });
    jest.spyOn(context, 'listProjectPaths').mockResolvedValue(['/p1']);
    jest.spyOn(context, 'clone').mockResolvedValue(invalidProjectContext);

    const actualPromise = context.call(ConfigurationCheck, { projects: true });

    await expect(actualPromise).rejects.toBeInstanceOf(ConfigurationCheckError);
    expect(context.listProjectPaths).toHaveBeenCalled();
    expect(context.clone).toHaveBeenCalledWith({
      workingDirectory: '/p1',
      processors: null,
    });
  });
});
