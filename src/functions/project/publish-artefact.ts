import {
  ProjectBuildArtefact,
  ProjectGetArtefactDestination,
  ProjectPublishArtefact,
  ProjectPushArtefact,
  ProjectReadVersion,
} from '../../definitions/index.js';
import { GitService } from '../../services/index.js';

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
  async _call(): Promise<string> {
    const artefact =
      this.artefact ?? (await this._context.call(ProjectBuildArtefact, {}));

    let tag = this.tag ?? ProjectPublishArtefact.TagFormatShortSha;
    switch (tag) {
      case ProjectPublishArtefact.TagFormatSemantic:
        tag = await this._context.call(ProjectReadVersion, {});
        break;
      case ProjectPublishArtefact.TagFormatShortSha:
        tag = await this._context.service(GitService).getCurrentShortSha();
        break;
    }
    if (this.tagPrefix) {
      tag = `${this.tagPrefix}${tag}`;
    }

    const destination = await this._context.call(
      ProjectGetArtefactDestination,
      { tag },
    );

    await this._context.call(ProjectPushArtefact, {
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
