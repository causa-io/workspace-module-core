import { wrapInfrastructureOperation } from '../../context-utils.js';
import {
  InfrastructurePrepare,
  InfrastructureProcessAndPrepare,
  type PrepareResult,
} from '../../definitions/index.js';

/**
 * Implements {@link InfrastructureProcessAndPrepare} by first running processors defined in the
 * `infrastructure.processors` configuration, then calling {@link InfrastructurePrepare}.
 * This should probably not be implemented by any other module.
 */
export class InfrastructureProcessAndPrepareForAll extends InfrastructureProcessAndPrepare {
  async _call(): Promise<PrepareResult> {
    return await wrapInfrastructureOperation(this._context, (context) =>
      context.call(InfrastructurePrepare, {
        print: this.print,
        destroy: this.destroy,
        output: this.output,
      }),
    );
  }

  _supports(): boolean {
    return true;
  }
}
