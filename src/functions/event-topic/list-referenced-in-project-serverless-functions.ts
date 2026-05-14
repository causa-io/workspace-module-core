import {
  EventTopicListReferencedInProject,
  type ReferencedEventTopics,
} from '../../definitions/index.js';
import type { ServerlessFunctionsConfiguration } from '../../index.js';

/**
 * Implements the {@link EventTopicListReferencedInProject} function for serverless functions.
 * The consumed topics are the ones triggering a function.
 * The produced topics are the ones listed as outputs of the functions.
 */
export class EventTopicListReferencedInProjectForServerlessFunctions extends EventTopicListReferencedInProject {
  async _call(): Promise<ReferencedEventTopics> {
    const functions = Object.values(
      this._context
        .asConfiguration<ServerlessFunctionsConfiguration>()
        .get('serverlessFunctions.functions', { unsafe: true }) ?? {},
    );

    const consumed = [
      ...new Set(
        functions.flatMap((fn) =>
          fn.trigger.type === 'event' && fn.trigger.topic
            ? fn.trigger.topic
            : [],
        ),
      ),
    ];

    const produced = [
      ...new Set(functions.flatMap((fn) => fn.outputs?.eventTopics ?? [])),
    ];

    return await this.mapToDefinitions(consumed, produced);
  }

  _supports() {
    return this._context.get('project.type') === 'serverlessFunctions';
  }
}
