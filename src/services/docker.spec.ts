import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { DockerService } from './docker.js';
import { ProcessServiceExitCodeError } from './process.js';

describe('DockerService', () => {
  let context: WorkspaceContext;
  let service: DockerService;

  beforeEach(() => {
    ({ context } = createContext({
      configuration: { docker: { network: { name: 'someCustomNetworkName' } } },
    }));
    service = context.service(DockerService);
  });

  describe('docker', () => {
    it('should spawn the docker command', async () => {
      const actualResult = await service.docker('--version', [], {
        capture: { stdout: true },
      });

      expect(actualResult.code).toEqual(0);
      expect(actualResult.stdout).toStartWith('Docker version');
    });
  });

  describe('networkName', () => {
    it('should default to the workspace name', async () => {
      ({ context } = createContext({
        configuration: { workspace: { name: 'someWorkspaceName' } },
      }));
      service = context.service(DockerService);

      const actualNetworkName = service.networkName;

      expect(actualNetworkName).toEqual('someWorkspaceName');
    });
  });

  describe('build', () => {
    it('should run the build command', async () => {
      const expectedResult = { code: 0 };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.build('/some/path', {
        file: 'MyDockerfile',
        platform: 'powerpc',
        buildArgs: { SOME_ARG: 'VALUE1', SOME_OTHER_ARG: undefined },
        tags: ['tag1', 'tag2'],
      });

      expect(actualResult).toEqual(expectedResult);
      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, args] = dockerSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('build');
      expect(actualArgs).toContain('/some/path');
      expect(actualArgs).toContain('--file MyDockerfile');
      expect(actualArgs).toContain('--platform powerpc');
      expect(actualArgs).toContain('--build-arg SOME_ARG=VALUE1');
      expect(actualArgs).toContain('--build-arg SOME_OTHER_ARG');
      expect(actualArgs).toContain('--tag tag1');
      expect(actualArgs).toContain('--tag tag2');
    });
  });

  describe('tag', () => {
    it('should run the tag command', async () => {
      const expectedResult = { code: 0 };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.tag('sourceImage', 'targetImage');

      expect(actualResult).toEqual(expectedResult);
      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, actualArgs] = dockerSpy.mock.calls[0];
      expect(actualCommand).toEqual('tag');
      expect(actualArgs).toEqual(['sourceImage', 'targetImage']);
    });
  });

  describe('push', () => {
    it('should run the push command', async () => {
      const expectedResult = { code: 0 };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.push('targetImage');

      expect(actualResult).toEqual(expectedResult);
      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, actualArgs] = dockerSpy.mock.calls[0];
      expect(actualCommand).toEqual('push');
      expect(actualArgs).toEqual(['targetImage']);
    });
  });

  describe('manifestInspect', () => {
    it('should run the manifest inspect command', async () => {
      const expectedData = { someInfo: '🐳' };
      const expectedResult = { code: 0, stdout: JSON.stringify(expectedData) };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.manifestInspect('myImage');

      expect(actualResult).toEqual(expectedData);
      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, actualArgs] = dockerSpy.mock.calls[0];
      expect(actualCommand).toEqual('manifest');
      expect(actualArgs).toEqual(['inspect', 'myImage']);
    });
  });

  describe('exists', () => {
    it('should return true', async () => {
      jest.spyOn(service, 'manifestInspect').mockResolvedValueOnce({});

      const actualExists = await service.exists('myImage');

      expect(actualExists).toBeTrue();
      expect(service.manifestInspect).toHaveBeenCalledOnceWith(
        'myImage',
        expect.anything(),
      );
    });

    it('should return false', async () => {
      jest.spyOn(service, 'manifestInspect').mockRejectedValueOnce(
        new ProcessServiceExitCodeError('docker', [], {
          code: 1,
        }),
      );

      const actualExists = await service.exists('myImage');

      expect(actualExists).toBeFalse();
      expect(service.manifestInspect).toHaveBeenCalledOnceWith(
        'myImage',
        expect.anything(),
      );
    });

    it('should throw an unknown error', async () => {
      jest
        .spyOn(service, 'manifestInspect')
        .mockRejectedValueOnce(new Error('💥'));

      const actualPromise = service.exists('myImage');

      await expect(actualPromise).rejects.toThrow('💥');
      expect(service.manifestInspect).toHaveBeenCalledOnceWith(
        'myImage',
        expect.anything(),
      );
    });
  });

  describe('rm', () => {
    it('should run the rm command', async () => {
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce({ code: 0 });

      await service.rm(['image1', 'image2'], { force: true, volumes: true });

      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, args] = dockerSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('rm');
      expect(actualArgs).toContain('image1');
      expect(actualArgs).toContain('image2');
      expect(actualArgs).toContain('--force');
      expect(actualArgs).toContain('--volumes');
    });
  });

  describe('run', () => {
    it('should run the run command', async () => {
      const expectedResult = { code: 0 };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      await service.run('myImage', {
        name: 'containerName',
        commandAndArgs: ['customCommand', 'withArgs'],
        detach: true,
        workdir: '/some/dir',
        mounts: [
          {
            type: 'bind',
            source: '/local/path',
            destination: '/bind',
            readonly: true,
          },
          { type: 'volume', destination: '/vol' },
        ],
        publish: [
          {
            container: 1234,
            local: 5678,
            host: '127.0.0.1',
            protocol: 'udp',
          },
          {
            container: 8888,
            local: 9999,
          },
        ],
        env: { FIRST_ENV: '😍', SECOND_ENV: undefined },
        rm: true,
        network: 'someNetwork',
      });

      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, args] = dockerSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('run');
      expect(actualArgs).toContain('myImage customCommand withArgs');
      expect(actualArgs).toContain('--name containerName');
      expect(actualArgs).toContain('--detach');
      expect(actualArgs).toContain('--workdir /some/dir');
      expect(actualArgs).toContain(
        '--mount type=bind,destination=/bind,source=/local/path,readonly',
      );
      expect(actualArgs).toContain('--mount type=volume,destination=/vol');
      expect(actualArgs).toContain('--publish 127.0.0.1:5678:1234/udp');
      expect(actualArgs).toContain('--publish 9999:8888');
      expect(actualArgs).toContain('--env FIRST_ENV=😍');
      expect(actualArgs).toContain('--env SECOND_ENV');
      expect(actualArgs).toContain('--rm');
      expect(actualArgs).toContain('--network someNetwork');
    });
  });

  describe('networkCreate', () => {
    it('should run the network create command', async () => {
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce({ code: 0 });

      await service.networkCreate('myNetwork');

      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, actualArgs] = dockerSpy.mock.calls[0];
      expect(actualCommand).toEqual('network');
      expect(actualArgs).toEqual(['create', 'myNetwork']);
    });
  });

  describe('networkLs', () => {
    it('should run the network ls command', async () => {
      const expectedResult = { code: 0 };
      const dockerSpy = jest
        .spyOn(service, 'docker')
        .mockResolvedValueOnce(expectedResult);

      const actualResult = await service.networkLs({
        filter: 'someFilter',
        quiet: true,
      });

      expect(actualResult).toEqual(expectedResult);
      expect(service.docker).toHaveBeenCalledOnce();
      const [actualCommand, args] = dockerSpy.mock.calls[0];
      const actualArgs = args.join(' ');
      expect(actualCommand).toEqual('network');
      expect(actualArgs).toStartWith('ls ');
      expect(actualArgs).toContain('--filter someFilter');
      expect(actualArgs).toContain('--quiet');
    });
  });

  describe('createNetworkIfNeeded', () => {
    it('should create the network', async () => {
      jest.spyOn(service, 'networkCreate').mockResolvedValueOnce();
      jest.spyOn(service, 'networkLs');

      const actualNetworkName = await service.createNetworkIfNeeded();

      expect(actualNetworkName).toEqual('someCustomNetworkName');
      expect(service.networkCreate).toHaveBeenCalledOnceWith(actualNetworkName);
      expect(service.networkLs).not.toHaveBeenCalled();
    });

    it('should not recreate the network', async () => {
      jest.spyOn(service, 'networkCreate').mockResolvedValueOnce();
      jest.spyOn(service, 'networkLs');

      await service.createNetworkIfNeeded();
      const actualNetworkName = await service.createNetworkIfNeeded();

      expect(actualNetworkName).toEqual('someCustomNetworkName');
      expect(service.networkCreate).toHaveBeenCalledOnceWith(actualNetworkName);
      expect(service.networkLs).not.toHaveBeenCalled();
    });

    it('should check for an existing network when creation fails', async () => {
      jest
        .spyOn(service, 'networkCreate')
        .mockRejectedValueOnce(
          new ProcessServiceExitCodeError('docker', [], { code: 1 }),
        );
      jest
        .spyOn(service, 'networkLs')
        .mockResolvedValueOnce({ code: 0, stdout: 'someCustomNetworkName\n' });

      const actualNetworkName = await service.createNetworkIfNeeded();

      expect(actualNetworkName).toEqual('someCustomNetworkName');
      expect(service.networkCreate).toHaveBeenCalledOnceWith(actualNetworkName);
      expect(service.networkLs).toHaveBeenCalledOnceWith({
        filter: 'name=someCustomNetworkName',
        quiet: true,
      });
    });

    it('should rethrow the error when creation fails for an unknown reason', async () => {
      jest
        .spyOn(service, 'networkCreate')
        .mockRejectedValueOnce(
          new ProcessServiceExitCodeError('docker', [], { code: 1 }),
        );
      jest
        .spyOn(service, 'networkLs')
        .mockResolvedValueOnce({ code: 0, stdout: '\n' });

      const actualPromise = service.createNetworkIfNeeded();

      await expect(actualPromise).rejects.toThrow(ProcessServiceExitCodeError);
      expect(service.networkCreate).toHaveBeenCalledOnceWith(
        'someCustomNetworkName',
      );
      expect(service.networkLs).toHaveBeenCalledOnceWith({
        filter: 'name=someCustomNetworkName',
        quiet: true,
      });
    });
  });
});
