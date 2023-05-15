import { WorkspaceContext } from '@causa/workspace';
import {
  FunctionRegistry,
  NoImplementationFoundError,
} from '@causa/workspace/function-registry';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  ArtefactAlreadyExistsError,
  ProjectPushArtefact,
} from '../definitions/index.js';
import { DockerService } from '../services/index.js';
import { createContext } from '../utils.test.js';
import { ProjectPushArtefactForServiceContainer } from './project-push-artefact-service-container.js';

describe('ProjectPushArtefactForServiceContainer', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let dockerService: DockerService;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      configuration: {
        workspace: { name: 'test' },
        project: { name: 'test', type: 'serviceContainer' },
      },
    }));
    dockerService = context.service(DockerService);
    functionRegistry.registerImplementations(
      ProjectPushArtefactForServiceContainer,
    );
  });

  it('should tag the local image and push it', async () => {
    const artefact = 'myLocalTag';
    const destination = 'remote/tag:1234';
    jest.spyOn(dockerService, 'exists').mockResolvedValueOnce(false);
    jest.spyOn(dockerService, 'tag').mockResolvedValueOnce({} as any);
    jest.spyOn(dockerService, 'push').mockResolvedValueOnce({} as any);

    const actualRemoteTag = await context.call(ProjectPushArtefact, {
      artefact,
      destination,
    });

    expect(actualRemoteTag).toEqual(destination);
    expect(dockerService.tag).toHaveBeenCalledOnceWith(artefact, destination);
    expect(dockerService.push).toHaveBeenCalledOnceWith(destination);
    expect(dockerService.exists).toHaveBeenCalledOnceWith(destination);
  });

  it('should not overwrite an existing remote image', async () => {
    const artefact = 'myLocalTag';
    const destination = 'remote/tag:1234';
    jest.spyOn(dockerService, 'exists').mockResolvedValueOnce(true);
    jest.spyOn(dockerService, 'tag').mockResolvedValueOnce({} as any);
    jest.spyOn(dockerService, 'push').mockResolvedValueOnce({} as any);

    const actualPromise = context.call(ProjectPushArtefact, {
      artefact,
      destination,
    });

    await expect(actualPromise).rejects.toThrow(ArtefactAlreadyExistsError);
    expect(dockerService.exists).toHaveBeenCalledOnceWith(destination);
    expect(dockerService.tag).not.toHaveBeenCalled();
    expect(dockerService.push).not.toHaveBeenCalled();
  });

  it('should overwrite a possibly existing remote image', async () => {
    const artefact = 'myLocalTag';
    const destination = 'remote/tag:1234';
    jest.spyOn(dockerService, 'exists').mockResolvedValueOnce(true);
    jest.spyOn(dockerService, 'tag').mockResolvedValueOnce({} as any);
    jest.spyOn(dockerService, 'push').mockResolvedValueOnce({} as any);

    const actualRemoteTag = await context.call(ProjectPushArtefact, {
      artefact,
      destination,
      overwrite: true,
    });

    expect(actualRemoteTag).toEqual(destination);
    expect(dockerService.tag).toHaveBeenCalledOnceWith(artefact, destination);
    expect(dockerService.push).toHaveBeenCalledOnceWith(destination);
  });

  it('should not support other project types than service container', async () => {
    const { context, functionRegistry } = createContext({
      configuration: {
        workspace: { name: 'test' },
        project: { name: 'test', type: 'function' },
      },
    });
    functionRegistry.registerImplementations(
      ProjectPushArtefactForServiceContainer,
    );

    expect(() =>
      context.call(ProjectPushArtefact, {
        artefact: 'myLocalTag',
        destination: 'remote/tag:1234',
      }),
    ).toThrow(NoImplementationFoundError);
  });
});
