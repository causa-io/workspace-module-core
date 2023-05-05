import { WorkspaceContext } from '@causa/workspace';
import { jest } from '@jest/globals';
import { createContext } from '../utils.test.js';
import { GitService } from './git.js';

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
      expect(service.git).toHaveBeenCalledOnceWith(
        'rev-parse',
        ['--short', 'HEAD'],
        expect.anything(),
      );
    });
  });
});
