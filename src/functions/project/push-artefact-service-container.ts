import {
  ArtefactAlreadyExistsError,
  ProjectPushArtefact,
} from '../../definitions/index.js';
import {
  DockerService,
  ProcessServiceExitCodeError,
} from '../../services/index.js';

/**
 * An implementation of the {@link ProjectPushArtefact} function handling `serviceContainer` projects.
 * It pushes the Docker image with local tag {@link ProjectPushArtefact.artefact} to
 * {@link ProjectPushArtefact.destination}.
 * If {@link ProjectPushArtefact.overwrite} is not set to `true`, pushing an existing remote tag will fail.
 */
export class ProjectPushArtefactForServiceContainer extends ProjectPushArtefact {
  async _call(): Promise<string> {
    const dockerService = this._context.service(DockerService);

    const localTag = this.artefact;
    const remoteTag = this.destination;

    if (!this.overwrite) {
      const exists = await dockerService.exists(remoteTag);
      if (exists) {
        throw new ArtefactAlreadyExistsError(remoteTag);
      }
    }

    await dockerService.tag(localTag, remoteTag);

    this._context.logger.info(
      `🚚 Pushing Docker image to the remote registry.`,
    );

    try {
      await dockerService.push(remoteTag);
    } catch (error) {
      if (
        error instanceof ProcessServiceExitCodeError &&
        error.command === 'docker'
      ) {
        throw new Error(
          `Pushing the Docker image failed. A possible reason is that Docker is not authorized to push to '${remoteTag}'.`,
        );
      }

      throw error;
    }

    this._context.logger.info(
      `🚚 Successfully pushed Docker image to '${remoteTag}'.`,
    );

    return remoteTag;
  }

  _supports(): boolean {
    return this._context.get('project.type') === 'serviceContainer';
  }
}
