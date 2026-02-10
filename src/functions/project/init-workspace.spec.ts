import { WorkspaceContext } from '@causa/workspace';
import {
  FunctionRegistry,
  NoImplementationFoundError,
} from '@causa/workspace/function-registry';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { load } from 'js-yaml';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  CausaListConfigurationSchemas,
  ProjectInit,
} from '../../definitions/index.js';
import type { ProjectInitForWorkspace as ProjectInitForWorkspaceType } from './init-workspace.js';

const setUpCausaFolderMock = jest.fn(async () => {});
jest.unstable_mockModule('@causa/workspace/initialization', () => ({
  setUpCausaFolder: setUpCausaFolderMock,
  CAUSA_FOLDER: '.causa',
}));

describe('ProjectInitWorkspace', () => {
  let tmpDir: string;
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let ProjectInitForWorkspace: typeof ProjectInitForWorkspaceType;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp(join(tmpdir(), 'causa-')));
    await mkdir(join(tmpDir, '.causa'), { recursive: true });
    ({ ProjectInitForWorkspace } = await import('./init-workspace.js'));
    ({ context } = createContext({
      rootPath: tmpDir,
      configuration: {
        workspace: { name: 'test' },
        causa: { modules: { 'some-module': '2.0.0' } },
      },
      functions: [ProjectInitForWorkspace],
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should not support initialization of a specific project', async () => {
    ({ context } = createContext({
      configuration: {
        workspace: { name: 'test' },
        project: { name: 'my-proj', language: 'typescript', type: 'package' },
      },
      functions: [ProjectInitForWorkspace],
    }));

    expect(() => context.call(ProjectInit, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should support initialization when the workspace option is set even within a project', async () => {
    ({ context } = createContext({
      rootPath: tmpDir,
      configuration: {
        workspace: { name: 'test' },
        project: { name: 'my-proj', language: 'typescript', type: 'package' },
      },
      functions: [ProjectInitForWorkspace],
    }));

    await context.call(ProjectInit, { workspace: true });

    expect(setUpCausaFolderMock).not.toHaveBeenCalled();
  });

  it('should be a no-op when no option is provided', async () => {
    await context.call(ProjectInit, {});

    expect(setUpCausaFolderMock).not.toHaveBeenCalled();
  });

  it('should reinstall module dependencies when the force option is provided', async () => {
    const causaDir = join(tmpDir, '.causa');
    const packageFile = join(causaDir, 'package.json');
    await mkdir(causaDir, { recursive: true });
    await writeFile(
      packageFile,
      JSON.stringify({ dependencies: { other: '1.0.0' } }),
    );

    await context.call(ProjectInit, { force: true });

    expect(setUpCausaFolderMock).toHaveBeenCalledExactlyOnceWith(
      context.rootPath,
      { 'some-module': '2.0.0', other: '1.0.0' },
      context.logger,
    );
  });

  it('should write the configuration schema file', async () => {
    ({ context, functionRegistry } = createContext({
      rootPath: tmpDir,
      configuration: {
        workspace: { name: 'test' },
      },
      functions: [ProjectInitForWorkspace],
    }));
    registerMockFunction(
      functionRegistry,
      CausaListConfigurationSchemas,
      async () => ['/path/to/schema1.yaml', '/path/to/schema2.yaml'],
    );

    await context.call(ProjectInit, {});

    const schemaFile = join(tmpDir, '.causa', 'configuration-schema.yaml');
    const content = await readFile(schemaFile, 'utf-8');
    const schema = load(content);
    expect(schema).toEqual({
      allOf: expect.toIncludeSameMembers([
        { $ref: '/path/to/schema1.yaml' },
        { $ref: '/path/to/schema2.yaml' },
      ]),
    });
  });

  it('should default to initializing no modules', async () => {
    ({ context } = createContext({
      rootPath: tmpDir,
      configuration: { workspace: { name: 'test' } },
      functions: [ProjectInitForWorkspace],
    }));
    jest.spyOn(context.logger, 'warn');

    await context.call(ProjectInit, { force: true });

    expect(setUpCausaFolderMock).toHaveBeenCalledExactlyOnceWith(
      context.rootPath,
      {},
      context.logger,
    );
    expect(context.logger.warn).toHaveBeenCalledTimes(2);
  });
});
