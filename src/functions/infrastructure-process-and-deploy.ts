import { WorkspaceContext } from '@causa/workspace';
import { cloneContextWithInfrastructureProcessorsIfNeeded } from '../context-utils.js';
import {
  InfrastructureDeploy,
  InfrastructureProcessAndDeploy,
} from '../definitions/index.js';

/**
 * Implements {@link InfrastructureProcessAndDeploy} by first running processors defined in the
 * `infrastructure.processors` configuration, then calling {@link InfrastructureDeploy}.
 * This should probably not be implemented by any other module.
 */
export class InfrastructureProcessAndDeployForAll extends InfrastructureProcessAndDeploy {
  async _call(context: WorkspaceContext): Promise<void> {
    context = await cloneContextWithInfrastructureProcessorsIfNeeded(context);

    return await context.call(InfrastructureDeploy, {
      deployment: this.deployment,
    });
  }

  _supports(): boolean {
    return true;
  }
}
