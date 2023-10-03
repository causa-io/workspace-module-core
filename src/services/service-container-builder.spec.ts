import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { DockerService } from './docker.js';
import { ServiceContainerBuilderService } from './service-container-builder.js';

describe('ServiceContainerBuilderService', () => {
  let context: WorkspaceContext;
  let service: ServiceContainerBuilderService;
  let dockerService: DockerService;
  let buildSpy: jest.SpiedFunction<DockerService['build']>;

  beforeEach(() => {
    ({ context } = createContext({
      rootPath: '/some-root',
      configuration: {
        workspace: { name: '🏷️' },
        serviceContainer: {
          architecture: 'amd64',
          buildFile: 'some-dockerfile',
          buildArgs: { SOME_ENV: { $format: '🍬' } },
          buildSecrets: {
            MY_SECRET: { file: 'some-file' },
            OTHER_SECRET: { value: { $format: '🙊' } },
          },
        },
      },
    }));
    service = context.service(ServiceContainerBuilderService);
    dockerService = context.service(DockerService);
    buildSpy = jest.spyOn(dockerService, 'build').mockResolvedValue({} as any);
  });

  describe('build', () => {
    it('should build the image using the configuration', async () => {
      await service.build('/some-path', 'some-image', '/some-default-file');

      expect(dockerService.build).toHaveBeenCalledWith('/some-path', {
        file: '/some-root/some-dockerfile',
        platform: 'amd64',
        buildArgs: { SOME_ENV: '🍬' },
        secrets: {
          MY_SECRET: { source: '/some-root/some-file' },
          OTHER_SECRET: { env: expect.any(String) },
        },
        tags: ['some-image'],
        environment: expect.any(Object),
      });
      const actualOptions = buildSpy.mock.calls[0][1];
      const otherSecretEnv = (actualOptions as any).secrets.OTHER_SECRET.env;
      expect(otherSecretEnv).not.toEqual('🙊');
      expect(actualOptions?.environment).toEqual({
        ...process.env,
        [otherSecretEnv]: '🙊',
      });
    });

    it('should include the base build configuration', async () => {
      await service.build('/some-path', 'some-image', '/some-default-file', {
        baseBuildArgs: { SOME_BASE_ENV: '🍭' },
        baseBuildSecrets: {
          BASE_SECRET: { file: '/some-base-file' },
          MY_SECRET: { value: '❌' },
          YET_ANOTHER: { value: '🗝️' },
        },
      });

      expect(dockerService.build).toHaveBeenCalledWith('/some-path', {
        file: '/some-root/some-dockerfile',
        platform: 'amd64',
        buildArgs: { SOME_ENV: '🍬', SOME_BASE_ENV: '🍭' },
        secrets: {
          MY_SECRET: { source: '/some-root/some-file' },
          BASE_SECRET: { source: '/some-base-file' },
          OTHER_SECRET: { env: expect.any(String) },
          YET_ANOTHER: { env: expect.any(String) },
        },
        tags: ['some-image'],
        environment: expect.any(Object),
      });
      const actualOptions = buildSpy.mock.calls[0][1];
      const otherSecretEnv = (actualOptions as any).secrets.OTHER_SECRET.env;
      const yetAnotherEnv = (actualOptions as any).secrets.YET_ANOTHER.env;
      expect(otherSecretEnv).not.toEqual('🙊');
      expect(yetAnotherEnv).not.toEqual('🗝️');
      expect(otherSecretEnv).not.toEqual(yetAnotherEnv);
      expect(actualOptions?.environment).toEqual({
        ...process.env,
        [otherSecretEnv]: '🙊',
        [yetAnotherEnv]: '🗝️',
      });
    });

    it('should use the default file if no file is configured', async () => {
      ({ context } = createContext({
        rootPath: '/some-root',
        configuration: { workspace: { name: '🏷️' } },
      }));
      service = context.service(ServiceContainerBuilderService);
      dockerService = context.service(DockerService);
      jest.spyOn(dockerService, 'build').mockResolvedValue({} as any);

      await service.build('/some-path', 'some-image', '/some-default-file');

      expect(dockerService.build).toHaveBeenCalledWith('/some-path', {
        file: '/some-default-file',
        platform: undefined,
        buildArgs: {},
        secrets: {},
        tags: ['some-image'],
        environment: process.env,
      });
    });
  });
});
