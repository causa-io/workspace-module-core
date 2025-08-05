import type { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { join } from 'path';
import { ProjectDiff } from '../../definitions/index.js';
import { GitService } from '../../services/index.js';
import { ProjectDiffForAll } from './diff.js';

describe('ProjectDiffForAll', () => {
  const gitRoot = '/git';
  const workspaceRoot = '/git/workspace';
  let context: WorkspaceContext;
  let gitService: GitService;

  beforeEach(() => {
    ({ context } = createContext({
      rootPath: workspaceRoot,
      functions: [ProjectDiffForAll],
    }));
    jest.spyOn(context, 'clone').mockImplementation(async (options) => {
      const workingDirectory = options?.workingDirectory ?? '❌';
      const { context } = createContext({
        rootPath: workspaceRoot,
        workingDirectory,
        projectPath: workingDirectory,
        configuration: {
          project: {
            name: workingDirectory,
            type: '🤖',
            language: '🤖',
            ...(options?.workingDirectory?.includes('proj2')
              ? { externalFiles: ['other/*.txt'] }
              : {}),
          },
        },
      });
      return context;
    });
    jest
      .spyOn(context, 'listProjectPaths')
      .mockResolvedValue([
        join(workspaceRoot, 'proj1'),
        join(workspaceRoot, 'proj2'),
        join(workspaceRoot, 'proj3'),
      ]);

    gitService = context.service(GitService);
    jest.spyOn(gitService, 'getRepositoryRootPath').mockResolvedValue(gitRoot);
  });

  function mockFilesDiff(files: string[]) {
    jest
      .spyOn(gitService, 'filesDiff')
      .mockResolvedValueOnce(files.map((f) => join('workspace', f)));
  }

  it('should throw if too many commits are provided', async () => {
    const actualPromise = context.call(ProjectDiff, {
      commits: ['a', 'b', 'c'],
    });

    await expect(actualPromise).rejects.toThrow(/too many commits/i);
  });

  it('should only return changed projects', async () => {
    mockFilesDiff([
      'proj1/file1',
      'proj1/file2',
      'proj3/sub/file3',
      'other/nope.nope',
    ]);

    const actualResult = await context.call(ProjectDiff, {});

    expect(actualResult).toEqual({
      [join(workspaceRoot, 'proj1')]: {
        diff: expect.toIncludeSameMembers([
          join(workspaceRoot, 'proj1/file1'),
          join(workspaceRoot, 'proj1/file2'),
        ]),
        configuration: expect.objectContaining({
          name: join(workspaceRoot, 'proj1'),
        }),
      },
      [join(workspaceRoot, 'proj3')]: {
        diff: [join(workspaceRoot, 'proj3/sub/file3')],
        configuration: expect.objectContaining({
          name: join(workspaceRoot, 'proj3'),
        }),
      },
    });
    expect(gitService.filesDiff).toHaveBeenCalledExactlyOnceWith({
      commits: [],
    });
  });

  it('should return a project changed by its external files', async () => {
    mockFilesDiff(['other/file1.txt']);

    const actualResult = await context.call(ProjectDiff, {});

    expect(actualResult).toEqual({
      [join(workspaceRoot, 'proj2')]: {
        diff: [join(workspaceRoot, 'other/file1.txt')],
        configuration: expect.objectContaining({
          name: join(workspaceRoot, 'proj2'),
        }),
      },
    });
    expect(gitService.filesDiff).toHaveBeenCalledExactlyOnceWith({
      commits: [],
    });
  });

  it('should use the provided commits', async () => {
    mockFilesDiff([]);

    const actualResult = await context.call(ProjectDiff, {
      commits: ['a', 'b'],
    });

    expect(actualResult).toEqual({});
    expect(gitService.filesDiff).toHaveBeenCalledExactlyOnceWith({
      commits: ['a', 'b'],
    });
  });
});
