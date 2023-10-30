import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ProjectInit } from '../../definitions/index.js';
import type { ProjectInitForWorkspace as ProjectInitForWorkspaceType } from './init-workspace.js';

const setUpCausaFolderMock = jest.fn(async () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
jest.unstable_mockModule('@causa/workspace/initialization', () => ({
  setUpCausaFolder: setUpCausaFolderMock,
  CAUSA_FOLDER: '.causa',
}));

describe('ProjectInitWorkspace', () => {
  let tmpDir: string;
  let context: WorkspaceContext;
  let ProjectInitForWorkspace: typeof ProjectInitForWorkspaceType;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp(join(tmpdir(), 'causa-')));
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
    expect(context.logger.warn).toHaveBeenCalledOnce();
  });
});
