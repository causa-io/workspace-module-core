import { WorkspaceContext } from '@causa/workspace';
import type { ServiceContainerConfiguration } from '../../configurations/index.js';
import {
  EventTopicListReferencedInProject,
  type ReferencedEventTopics,
} from '../../definitions/index.js';

/**
 * Implements the {@link EventTopicListReferencedInProject} function for service containers.
 * The consumed topics are the ones triggering a service endpoint.
 * The produced topics are the ones listed as outputs to the service.
 */
export class EventTopicListReferencedInProjectForServiceContainer extends EventTopicListReferencedInProject {
  async _call(context: WorkspaceContext): Promise<ReferencedEventTopics> {
    const serviceContainerConf =
      context.asConfiguration<ServiceContainerConfiguration>();
    const triggers =
      serviceContainerConf.get('serviceContainer.triggers', { unsafe: true }) ??
      {};
    const consumed = [
      ...new Set(
        Object.values(triggers).flatMap((trigger) =>
          trigger.type === 'event' ? trigger.topic : [],
        ),
      ),
    ];

    const produced = [
      ...new Set(
        serviceContainerConf.get('serviceContainer.outputs.eventTopics') ?? [],
      ),
    ];

    return await this.mapToDefinitions(context, consumed, produced);
  }

  _supports(context: WorkspaceContext): boolean {
    return context.get('project.type') === 'serviceContainer';
  }
}
