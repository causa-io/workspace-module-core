import { WorkspaceContext } from '@causa/workspace';
import {
  ArtefactAlreadyExistsError,
  ProjectPushArtefact,
} from '../definitions/index.js';
import { DockerService } from '../services/index.js';

/**
 * An implementation of the {@link ProjectPushArtefact} function handling `serviceContainer` projects.
 * It pushes the Docker image with local tag {@link ProjectPushArtefact.artefact} to
 * {@link ProjectPushArtefact.destination}.
 * If {@link ProjectPushArtefact.overwrite} is not set to `true`, pushing an existing remote tag will fail.
 */
export class ProjectPushArtefactForServiceContainer extends ProjectPushArtefact {
  async _call(context: WorkspaceContext): Promise<string> {
    const dockerService = context.service(DockerService);

    const localTag = this.artefact;
    const remoteTag = this.destination;

    if (!this.overwrite) {
      const exists = await dockerService.exists(remoteTag);
      if (exists) {
        throw new ArtefactAlreadyExistsError(remoteTag);
      }
    }

    await dockerService.tag(localTag, remoteTag);

    context.logger.info(`🚚 Pushing Docker image to the remote registry.`);
    await dockerService.push(remoteTag);

    context.logger.info(
      `🚚 Successfully pushed Docker image to '${remoteTag}'.`,
    );

    return remoteTag;
  }

  _supports(context: WorkspaceContext): boolean {
    return context.get('project.type') === 'serviceContainer';
  }
}
