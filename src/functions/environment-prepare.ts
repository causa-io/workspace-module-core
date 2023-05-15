import { WorkspaceContext } from '@causa/workspace';
import { cloneContextForEnvironmentProjectIfNeeded } from '../context-utils.js';
import {
  EnvironmentPrepare,
  InfrastructureProcessAndPrepare,
  PrepareResult,
} from '../definitions/index.js';

/**
 * Implements {@link EnvironmentPrepare} by selecting the relevant infrastructure project (defined by the
 * `infrastructure.environmentProject` configuration) and running {@link InfrastructureProcessAndPrepare} on it.
 * This should probably not be implemented by any other module.
 */
export class EnvironmentPrepareForAll extends EnvironmentPrepare {
  async _call(context: WorkspaceContext): Promise<PrepareResult> {
    context = await cloneContextForEnvironmentProjectIfNeeded(context);

    return await context.call(InfrastructureProcessAndPrepare, {
      print: this.print,
      output: this.output,
    });
  }

  _supports(): boolean {
    return true;
  }
}
