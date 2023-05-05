import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
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
import { createContext } from '../utils.test.js';
import { ProjectPublishArtefactForAll } from './project-publish-artefact.js';

class BuildArtefact extends ProjectBuildArtefact {
  async _call(): Promise<string> {
    return '🍱';
  }

  _supports(): boolean {
    return true;
  }
}

class ReadVersion extends ProjectReadVersion {
  async _call(): Promise<string> {
    return '🔖';
  }

  _supports(): boolean {
    return true;
  }
}

class GetArtefactDestination extends ProjectGetArtefactDestination {
  async _call(): Promise<string> {
    return `dst/${this.tag}`;
  }

  _supports(): boolean {
    return true;
  }
}

class PushArtefact extends ProjectPushArtefact {
  async _call(): Promise<string> {
    PushArtefact.artefact = this.artefact;
    PushArtefact.destination = this.destination;
    PushArtefact.overwrite = this.overwrite;
    return this.destination;
  }

  _supports(): boolean {
    return true;
  }

  static artefact: string | undefined;
  static destination: string | undefined;
  static overwrite: boolean | undefined;
}

describe('ProjectPublishArtefactForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let gitService: GitService;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext());
    gitService = context.service(GitService);
    functionRegistry.registerImplementations(
      BuildArtefact,
      ReadVersion,
      GetArtefactDestination,
      PushArtefact,
      ProjectPublishArtefactForAll,
    );
    PushArtefact.artefact = undefined;
    PushArtefact.destination = undefined;
    PushArtefact.overwrite = undefined;
  });

  it('should build and push an artefact using the git short SHA', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {});

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(PushArtefact.artefact).toEqual('🍱');
    expect(PushArtefact.destination).toEqual('dst/abcd');
    expect(PushArtefact.overwrite).toBeUndefined();
  });

  it('should use the provided artefact instead of building it', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');
    jest.spyOn(BuildArtefact.prototype, '_call');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      artefact: 'myArtefact',
    });

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(PushArtefact.artefact).toEqual('myArtefact');
    expect(PushArtefact.destination).toEqual('dst/abcd');
    expect(PushArtefact.overwrite).toBeUndefined();
    expect(BuildArtefact.prototype._call).not.toHaveBeenCalled();
  });

  it('should overwrite when pushing', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      overwrite: true,
    });

    expect(actualDestination).toEqual('dst/abcd');
    expect(gitService.getCurrentShortSha).toHaveBeenCalledOnce();
    expect(PushArtefact.artefact).toEqual('🍱');
    expect(PushArtefact.destination).toEqual('dst/abcd');
    expect(PushArtefact.overwrite).toBeTrue();
  });

  it('should use the semantic version', async () => {
    jest.spyOn(gitService, 'getCurrentShortSha').mockResolvedValueOnce('abcd');

    const actualDestination = await context.call(ProjectPublishArtefact, {
      tag: ProjectPublishArtefact.TagFormatSemantic,
    });

    expect(actualDestination).toEqual('dst/🔖');
    expect(gitService.getCurrentShortSha).not.toHaveBeenCalled();
    expect(PushArtefact.artefact).toEqual('🍱');
    expect(PushArtefact.destination).toEqual('dst/🔖');
    expect(PushArtefact.overwrite).toBeUndefined();
  });
});
