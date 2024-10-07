import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { GitService } from './git.js';
import type { SpawnedProcessResult } from './process.js';

describe('GitService', () => {
  let context: WorkspaceContext;
  let service: GitService;

  beforeEach(() => {
    ({ context } = createContext({}));
    service = context.service(GitService);
  });

  describe('git', () => {
    it('should spawn the git command', async () => {
      const actualResult = await service.git('--version', [], {
        capture: { stdout: true },
      });

      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toStartWith('git version');
    });
  });

  describe('getCurrentShortSha', () => {
    it('should call git rev-parse', async () => {
      const expectedShortSha = 'abcd';
      jest
        .spyOn(service, 'git')
        .mockResolvedValueOnce({ code: 0, stdout: `${expectedShortSha}\n` });

      const actualShortSha = await service.getCurrentShortSha();

      expect(actualShortSha).toEqual(expectedShortSha);
      expect(service.git).toHaveBeenCalledExactlyOnceWith(
        'rev-parse',
        ['--short', 'HEAD'],
        expect.anything(),
      );
    });
  });

  describe('getRepositoryRootPath', () => {
    it('should call git rev-parse', async () => {
      const expectedRootPath = '/root/dir';
      jest
        .spyOn(service, 'git')
        .mockResolvedValueOnce({ code: 0, stdout: `${expectedRootPath}\n` });

      const actualRootPath = await service.getRepositoryRootPath();

      expect(actualRootPath).toEqual(expectedRootPath);
      expect(service.git).toHaveBeenCalledExactlyOnceWith(
        'rev-parse',
        ['--show-toplevel'],
        expect.anything(),
      );
    });

    it('should run from the specified directory', async () => {
      const expectedRootPath = '/root/dir';
      jest
        .spyOn(service, 'git')
        .mockResolvedValueOnce({ code: 0, stdout: `${expectedRootPath}\n` });

      const actualRootPath = await service.getRepositoryRootPath({
        directory: '/some/other/dir',
      });

      expect(actualRootPath).toEqual(expectedRootPath);
      expect(service.git).toHaveBeenCalledExactlyOnceWith(
        'rev-parse',
        ['--show-toplevel'],
        expect.objectContaining({ workingDirectory: '/some/other/dir' }),
      );
    });
  });

  describe('diff', () => {
    it('should call git diff', async () => {
      const expectedResult: SpawnedProcessResult = { code: 0, stdout: '' };
      const gitSpy = jest
        .spyOn(service, 'git')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.diff({
        commit: 'abcd',
        cached: true,
        nameOnly: true,
        paths: ['a', 'b'],
      });

      expect(actualResult).toBe(expectedResult);
      expect(service.git).toHaveBeenCalledOnce();
      const [actualCommand, args] = gitSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('diff');
      expect(actualArgs).toContain('--name-only');
      expect(actualArgs).toContain('--cached');
      expect(actualArgs).toEndWith(' abcd -- a b');
    });
  });

  describe('filesDiff', () => {
    it('should call git diff', async () => {
      const expectedDiff = 'file a\nfile b\n\n';
      const gitSpy = jest
        .spyOn(service, 'git')
        .mockResolvedValueOnce({ code: 0, stdout: expectedDiff });

      const actualDiff = await service.filesDiff({
        commit: 'abcd..efgh',
        cached: true,
        paths: ['a', 'b'],
      });

      expect(actualDiff).toEqual(['file a', 'file b']);
      const [actualCommand, args, options] = gitSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('diff');
      expect(actualArgs).toContain('--name-only');
      expect(actualArgs).toContain('--cached');
      expect(actualArgs).toEndWith(' abcd..efgh -- a b');
      expect(options).toEqual({ capture: { stdout: true }, logging: null });
    });
  });
});
