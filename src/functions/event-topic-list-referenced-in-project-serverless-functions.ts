import { WorkspaceContext } from '@causa/workspace';
import {
  EventTopicListReferencedInProject,
  ReferencedEventTopics,
} from '../definitions/index.js';
import { ServerlessFunctionsConfiguration } from '../index.js';

/**
 * Implements the {@link EventTopicListReferencedInProject} function for serverless functions.
 * The consumed topics are the ones triggering a function.
 * The produced topics are the ones listed as outputs of the functions.
 */
export class EventTopicListReferencedInProjectForServerlessFunctions extends EventTopicListReferencedInProject {
  async _call(context: WorkspaceContext): Promise<ReferencedEventTopics> {
    const functions = Object.values(
      context
        .asConfiguration<ServerlessFunctionsConfiguration>()
        .get('serverlessFunctions.functions') ?? {},
    );

    const consumed = [
      ...new Set(
        functions.flatMap((fn) =>
          fn.trigger.type === 'event' ? fn.trigger.topic : [],
        ),
      ),
    ];

    const produced = [
      ...new Set(functions.flatMap((fn) => fn.outputs?.eventTopics ?? [])),
    ];

    return { consumed, produced };
  }

  _supports(context: WorkspaceContext) {
    return context.get('project.type') === 'serverlessFunctions';
  }
}
