import { WorkspaceContext } from '@causa/workspace';
import {
  EventTopicGenerateCode,
  EventTopicGenerateCodeReferencedInProject,
  EventTopicListReferencedInProject,
} from '../../definitions/index.js';

/**
 * Implements the {@link EventTopicGenerateCodeReferencedInProject} function.
 * This should be the only implementation of this function, as it simply combines other functions:
 * - {@link EventTopicListReferencedInProject}
 * - {@link EventTopicGenerateCode}
 */
export class EventTopicGenerateCodeReferencedInProjectForAll extends EventTopicGenerateCodeReferencedInProject {
  async _call(context: WorkspaceContext): Promise<string[]> {
    const projectPath = context.getProjectPathOrThrow();

    context.logger.info(
      `🔨 Generating code for event topics referenced by project at path '${projectPath}'.`,
    );

    const { consumed, produced } = await context.call(
      EventTopicListReferencedInProject,
      {},
    );

    const definitions = [
      ...new Map([...consumed, ...produced].map((d) => [d.id, d])).values(),
    ];

    await context.call(EventTopicGenerateCode, { definitions });

    return definitions.map((def) => def.id);
  }

  _supports(): boolean {
    return true;
  }
}
