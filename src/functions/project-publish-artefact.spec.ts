import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  ProjectBuildArtefact,
  ProjectGetArtefactDestination,
  ProjectPublishArtefact,
  ProjectPushArtefact,
  ProjectReadVersion,
} from '../definitions/index.js';
import { GitService } from '../index.js';
import { ProjectPublishArtefactForAll } from './project-publish-artefact.js';

describe('ProjectPublishArtefactForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let gitService: GitService;
  let buildArtefactMock: WorkspaceFunctionCallMock<ProjectBuildArtefact>;
  let pushArtefactMock: WorkspaceFunctionCallMock<ProjectPushArtefact>;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      functions: [ProjectPublishArtefactForAll],
    }));
    gitService = context.service(GitService);
    registerMockFunction(
      functionRegistry,
      ProjectReadVersion,
      async () => '🔖',
    );
    buildArtefactMock = registerMockFunction(
      functionRegistry,
      ProjectBuildArtefact,
      async () => '🍱',
    );
    registerMockFunction(
      functionRegistry,
      ProjectGetArtefactDestination,
      async (_, args) => `dst/${args.tag}`,
    );
    pushArtefactMock = registerMockFunction(
      functionRegistry,
      ProjectPushArtefact,
      async (_, args) => args.destination,
    );
  });

  it('should build and push an artefact using the git short SHA', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {});

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(pushArtefactMock).toHaveBeenCalledOnceWith(context, {
      artefact: '🍱',
      destination: 'dst/abcd',
      overwrite: undefined,
    });
  });

  it('should use the provided artefact instead of building it', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      artefact: 'myArtefact',
    });

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(pushArtefactMock).toHaveBeenCalledOnceWith(context, {
      artefact: 'myArtefact',
      destination: 'dst/abcd',
      overwrite: undefined,
    });
    expect(buildArtefactMock).not.toHaveBeenCalled();
  });

  it('should overwrite when pushing', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      overwrite: true,
    });

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(pushArtefactMock).toHaveBeenCalledOnceWith(context, {
      artefact: '🍱',
      destination: 'dst/abcd',
      overwrite: true,
    });
  });

  it('should use the semantic version', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      tag: ProjectPublishArtefact.TagFormatSemantic,
    });

    expect(actualDestination).toEqual('dst/🔖');
    expect(gitService.getCurrentShortSha).not.toHaveBeenCalled();
    expect(pushArtefactMock).toHaveBeenCalledOnceWith(context, {
      artefact: '🍱',
      destination: 'dst/🔖',
      overwrite: undefined,
    });
  });
});
