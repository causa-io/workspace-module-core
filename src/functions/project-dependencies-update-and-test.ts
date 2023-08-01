import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import {
  ProjectDependenciesUpdate,
  ProjectDependenciesUpdateAndTest,
  ProjectTest,
} from '../definitions/index.js';

/**
 * Implements {@link ProjectDependenciesUpdateAndTest} for any kind of project.
 * There probably shouldn't be any other implementation of this function, and the only limiting factor is the
 * availability of implementations for functions this may call:
 * - {@link ProjectDependenciesUpdate}
 * - {@link ProjectTest}
 *
 * {@link ProjectTest} is optional, but a warning will be logged if it is not available.
 */
export class ProjectDependenciesUpdateAndTestForAll extends ProjectDependenciesUpdateAndTest {
  async _call(context: WorkspaceContext): Promise<void> {
    let shouldRunTests = !this.skipTest;

    if (shouldRunTests) {
      try {
        context.logger.debug('Running tests before updating dependencies.');
        await context.call(ProjectTest, {});
      } catch (error) {
        if (!(error instanceof NoImplementationFoundError)) {
          throw error;
        }

        context.logger.warn(
          '⚠️ No implementation exists to run tests for the project, skipping them.',
        );
        shouldRunTests = false;
      }
    }

    const didUpdate = await context.call(ProjectDependenciesUpdate, {});

    if (!shouldRunTests) {
      return;
    }

    if (!didUpdate) {
      context.logger.debug(
        'Dependencies were not updated, skipping tests after updating dependencies.',
      );
      return;
    }

    try {
      context.logger.debug('Running tests after updating dependencies.');
      await context.call(ProjectTest, {});
    } catch (error) {
      context.logger.error(
        '❌ Tests failed after updating dependencies, you may want to rollback the update or fix the tests before continuing.',
      );

      throw error;
    }
  }

  _supports(): boolean {
    return true;
  }
}
