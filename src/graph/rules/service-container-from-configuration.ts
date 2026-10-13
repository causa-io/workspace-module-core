import type { ServiceContainerConfiguration } from '../../configurations/index.js';
import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleEdge,
  type GraphRuleNode,
  type GraphWarning,
  type TriggerGraphNodeData,
} from '../../definitions/index.js';
import { projectId, topicId, triggerId, triggerLocator } from '../ids.js';
import { ModelFact } from '../model.js';
import { ProjectsFact } from '../projects.js';

/**
 * The elements declared by the `serviceContainer` configuration of every service container project.
 *
 * - A `trigger` node per `serviceContainer.triggers` entry. The data is the trigger's declared shape (type, enabled,
 *   endpoint path, schedule, timezone, queue). The other properties of the trigger, e.g. module-specific options, are
 *   copied as is to `extra`, except the endpoint and the topic, which the graph already represents.
 * - A `delivers` edge from a topic to each `event` trigger consuming it.
 * - A `publishes` edge from a project to each topic of its `serviceContainer.outputs.eventTopics`.
 */
export const serviceContainerFromConfiguration: GraphRule = {
  name: 'serviceContainerFromConfiguration',
  kind: GraphOriginKind.Declared,
  description:
    'For each service container project, one `trigger` node per key of `serviceContainer.triggers`, parented to the project, and one `delivers` edge to each trigger of type `event` from the topic it names. One `publishes` edge from a project to each topic listed in its `serviceContainer.outputs.eventTopics`.',
  async run(graph) {
    const { locator } = graph;
    const [projects, model] = await Promise.all([
      graph.get(ProjectsFact),
      graph.get(ModelFact),
    ]);
    const nodes: GraphRuleNode[] = [];
    const edges: GraphRuleEdge[] = [];
    const warnings: GraphWarning[] = [];

    const string = (value: unknown) =>
      typeof value === 'string' ? value : undefined;

    for (const project of projects.filter(
      (p) => p.type === 'serviceContainer',
    )) {
      const configuration =
        project.context.asConfiguration<ServiceContainerConfiguration>();

      const triggers =
        configuration.get('serviceContainer.triggers', { unsafe: true }) ?? {};
      for (const [name, trigger] of Object.entries(triggers)) {
        const {
          description,
          type,
          enabled,
          endpoint,
          schedule,
          timezone,
          queue,
          topic,
          ...extra
        } = trigger;
        const data: TriggerGraphNodeData = {
          type: string(type),
          enabled: typeof enabled === 'boolean' ? enabled : undefined,
          path: string(endpoint?.path),
          schedule: string(schedule),
          timezone: string(timezone),
          queue: string(queue),
          extra: Object.keys(extra).length > 0 ? extra : undefined,
        };
        nodes.push({
          layer: 'architecture',
          type: 'trigger',
          locator: triggerLocator(project.directory, name),
          parent: projectId(project.directory),
          name,
          description: string(description),
          sources: [
            await locator.configurationSource(project.context, [
              'serviceContainer',
              'triggers',
              name,
            ]),
          ],
          data,
        });

        if (type !== 'event') {
          continue;
        }

        const source = await locator.configurationSource(project.context, [
          'serviceContainer',
          'triggers',
          name,
          'topic',
        ]);
        if (typeof topic !== 'string') {
          warnings.push({
            message: `Trigger '${name}' of '${project.name}' has no topic.`,
            sources: [source],
          });
          continue;
        }

        if (!model.topics.has(topic)) {
          warnings.push({
            message: `Trigger '${name}' of '${project.name}' consumes '${topic}', which no event schema defines.`,
            sources: [source],
          });
          continue;
        }

        edges.push({
          type: 'delivers',
          from: topicId(topic),
          to: triggerId(project.directory, name),
          sources: [source],
        });
      }

      const topics = configuration.get('serviceContainer.outputs.eventTopics');
      for (const [index, topic] of (topics ?? []).entries()) {
        const source = await locator.configurationSource(project.context, [
          'serviceContainer',
          'outputs',
          'eventTopics',
          index,
        ]);
        if (!model.topics.has(topic)) {
          warnings.push({
            message: `Project '${project.name}' publishes to '${topic}', which no event schema defines.`,
            sources: [source],
          });
          continue;
        }

        edges.push({
          type: 'publishes',
          from: projectId(project.directory),
          to: topicId(topic),
          sources: [source],
        });
      }
    }

    return { nodes, edges, warnings };
  },
};
