import { WorkspaceContext } from '@causa/workspace';
import {
  EventTopicGenerateCode,
  EventTopicGenerateCodeReferencedInProject,
  EventTopicList,
  EventTopicListReferencedInProject,
} from '../../definitions/index.js';

/**
 * An error thrown when the schema definition for the given event topics cannot be found.
 */
export class MissingEventTopicDefinitionsError extends Error {
  constructor(readonly topicIds: string[]) {
    super(
      `Missing definitions for topics ${topicIds
        .map((id) => `'${id}'`)
        .join(', ')}.`,
    );
  }
}

/**
 * Implements the {@link EventTopicGenerateCodeReferencedInProject} function.
 * This should be the only implementation of this function, as it simply combines other functions:
 * - {@link EventTopicList}
 * - {@link EventTopicListReferencedInProject}
 * - {@link EventTopicGenerateCode}
 */
export class EventTopicGenerateCodeReferencedInProjectForAll extends EventTopicGenerateCodeReferencedInProject {
  async _call(context: WorkspaceContext): Promise<string[]> {
    context.getProjectPathOrThrow();

    const topicDefinitions = await context.call(EventTopicList, {});
    const existingTopicIds = new Set(topicDefinitions.map((d) => d.id));

    const { consumed, produced } = await context.call(
      EventTopicListReferencedInProject,
      {},
    );
    const referencedTopicIdsSet = new Set([...consumed, ...produced]);
    const referencedTopicIds = [...referencedTopicIdsSet];
    const missingDefinitions = referencedTopicIds.filter(
      (id) => !existingTopicIds.has(id),
    );

    if (missingDefinitions.length > 0) {
      throw new MissingEventTopicDefinitionsError(missingDefinitions);
    }

    const definitions = topicDefinitions.filter((d) =>
      referencedTopicIdsSet.has(d.id),
    );

    await context.call(EventTopicGenerateCode, { definitions });

    return referencedTopicIds;
  }

  _supports(): boolean {
    return true;
  }
}
