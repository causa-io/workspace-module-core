import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { dirname } from 'path';
import type { Logger } from 'pino';
import { fileURLToPath } from 'url';
import { ProcessService, ProcessServiceExitCodeError } from './process.js';

describe('ProcessService', () => {
  let context: WorkspaceContext;
  let logger: Logger;
  let service: ProcessService;

  beforeEach(() => {
    ({ context } = createContext({
      workingDirectory: dirname(fileURLToPath(import.meta.url)),
    }));
    logger = context.logger;
    service = context.service(ProcessService);
  });

  describe('spawn', () => {
    it('should capture stdout', async () => {
      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log("🎉"); console.error("💣");'],
        { capture: { stdout: true } },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toEqual('🎉\n');
      expect(actualResult.stderr).toBeUndefined();
    });

    it('should capture stderr', async () => {
      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log("🎉"); console.error("💣");'],
        { capture: { stderr: true } },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toBeUndefined();
      expect(actualResult.stderr).toEqual('💣\n');
    });

    it('should run the process in the workspace working directory', async () => {
      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log(process.cwd())'],
        { capture: { stdout: true } },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toEqual(`${context.workingDirectory}\n`);
      expect(actualResult.stderr).toBeUndefined();
    });

    it('should run the process in the specified directory', async () => {
      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log(process.cwd())'],
        { capture: { stdout: true }, workingDirectory: process.cwd() },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toEqual(`${process.cwd()}\n`);
      expect(actualResult.stderr).toBeUndefined();
    });

    it('should pass environment variables', async () => {
      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log(process.env.MY_TEST_VAR)'],
        {
          capture: { stdout: true },
          environment: { ...process.env, MY_TEST_VAR: '🔑' },
        },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toEqual('🔑\n');
      expect(actualResult.stderr).toBeUndefined();
    });

    it('should log outputs at the specified levels', async () => {
      jest.spyOn(logger, 'trace');
      jest.spyOn(logger, 'warn');

      const actualProcess = service.spawn(
        'node',
        ['-e', 'console.log("🎉\\n✨"); console.error("💣");'],
        { logging: { stdout: 'trace', stderr: 'warn' } },
      );

      const actualResult = await actualProcess.result;
      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toBeUndefined();
      expect(actualResult.stderr).toBeUndefined();
      expect(logger.trace).toHaveBeenCalledTimes(2);
      expect(logger.trace).toHaveBeenCalledWith('🎉');
      expect(logger.trace).toHaveBeenCalledWith('✨');
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith('💣');
    });

    it('should throw and return the correct exit code', async () => {
      const actualProcess = service.spawn('node', ['-e', 'process.exit(5)']);

      const actualPromise = actualProcess.result;
      await expect(actualPromise).rejects.toThrow(ProcessServiceExitCodeError);
      await expect(actualPromise).rejects.toMatchObject({
        command: 'node',
        args: ['-e', 'process.exit(5)'],
        result: { code: 5 },
      });
    });
  });
});
