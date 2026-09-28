import {
  GraphOriginKind,
  type GraphRuleEdge,
  type GraphRule,
} from '../../definitions/index.js';
import type { ServiceContainerConfiguration } from '../../configurations/index.js';
import { ProjectsFact } from '../projects.js';
import { projectId, triggerId } from '../ids.js';

/**
 * An `enqueues` edge from a service container project to each of its own `task` triggers.
 * Nothing declares who enqueues: the queue is declared on the consuming trigger, and the producer only in code. This
 * assumes the owning project is the producer.
 */
export const enqueuesAssumedFromOwningProject: GraphRule = {
  name: 'enqueuesAssumedFromOwningProject',
  kind: GraphOriginKind.Inferred,
  description:
    'One `enqueues` edge from a service container project to each of its own `task` triggers, assuming the owning project is the producer.',
  async run(graph) {
    const { locator } = graph;
    const projects = await graph.get(ProjectsFact);
    const edges: GraphRuleEdge[] = [];

    for (const project of projects.filter(
      (p) => p.type === 'serviceContainer',
    )) {
      const triggers =
        project.context
          .asConfiguration<ServiceContainerConfiguration>()
          .get('serviceContainer.triggers', { unsafe: true }) ?? {};
      for (const [name, trigger] of Object.entries(triggers)) {
        if (trigger.type !== 'task') {
          continue;
        }

        edges.push({
          type: 'enqueues',
          from: projectId(project.directory),
          to: triggerId(project.directory, name),
          sources: [
            await locator.configurationSource(project.context, [
              'serviceContainer',
              'triggers',
              name,
            ]),
          ],
        });
      }
    }

    return { edges };
  },
};
