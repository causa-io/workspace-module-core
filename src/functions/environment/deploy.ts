import { WorkspaceContext } from '@causa/workspace';
import { cloneContextForEnvironmentProjectIfNeeded } from '../../context-utils.js';
import {
  EnvironmentDeploy,
  InfrastructureProcessAndDeploy,
} from '../../definitions/index.js';

/**
 * Implements {@link EnvironmentDeploy} by selecting the relevant infrastructure project (defined by the
 * `infrastructure.environmentProject` configuration) and running {@link InfrastructureProcessAndDeploy} on it.
 * This should probably not be implemented by any other module.
 */
export class EnvironmentDeployForAll extends EnvironmentDeploy {
  async _call(context: WorkspaceContext): Promise<void> {
    context = await cloneContextForEnvironmentProjectIfNeeded(context);

    await context.call(InfrastructureProcessAndDeploy, {
      deployment: this.deployment,
    });
  }

  _supports(): boolean {
    return true;
  }
}
