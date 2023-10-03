import { WorkspaceContext } from '@causa/workspace';
import {
  ProjectBuildArtefact,
  ProjectGetArtefactDestination,
  ProjectPublishArtefact,
  ProjectPushArtefact,
  ProjectReadVersion,
} from '../definitions/index.js';
import { GitService } from '../services/index.js';

/**
 * Implements {@link ProjectPublishArtefact} for any kind of project.
 * There probably shouldn't be any other implementation of this function, and the only limiting factor is the
 * availability of implementations for functions this may call:
 * - {@link ProjectBuildArtefact}
 * - {@link ProjectReadVersion}
 * - {@link ProjectGetArtefactDestination}
 * - {@link ProjectPushArtefact}
 */
export class ProjectPublishArtefactForAll extends ProjectPublishArtefact {
  async _call(context: WorkspaceContext): Promise<string> {
    const artefact =
      this.artefact ?? (await context.call(ProjectBuildArtefact, {}));

    let tag = this.tag ?? ProjectPublishArtefact.TagFormatShortSha;
    switch (tag) {
      case ProjectPublishArtefact.TagFormatSemantic:
        tag = await context.call(ProjectReadVersion, {});
        break;
      case ProjectPublishArtefact.TagFormatShortSha:
        const gitService = context.service(GitService);
        tag = await gitService.getCurrentShortSha();
        break;
    }
    if (this.tagPrefix) {
      tag = `${this.tagPrefix}${tag}`;
    }

    const destination = await context.call(ProjectGetArtefactDestination, {
      tag,
    });

    await context.call(ProjectPushArtefact, {
      artefact,
      destination,
      overwrite: this.overwrite,
    });

    return destination;
  }

  _supports(): boolean {
    return true;
  }
}
