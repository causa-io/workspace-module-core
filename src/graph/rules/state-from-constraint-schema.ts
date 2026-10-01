import { relative } from 'path';
import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleEdge,
  type GraphRuleNode,
  type GraphWarning,
  type TransitionsGraphEdgeData,
} from '../../definitions/index.js';
import { stateId, topicId } from '../ids.js';
import { ModelFact } from '../model.js';

/**
 * A `state` node per constraint schema (`causa.constraintFor`) whose target is an entity.
 *
 * Event constraints, which target a topic's event schema, are not states: each of their `causa.entityMutationFrom`
 * entries is a `transitions` edge from that state to the state the constraint's `data` references. A `null` entry is a
 * creation, from outside the graph. The data carries the event name (the `name` constant), the property changes, and
 * the topic.
 */
export const stateFromConstraintSchema: GraphRule = {
  name: 'stateFromConstraintSchema',
  kind: GraphOriginKind.Declared,
  description:
    "One `state` node per schema whose `causa.constraintFor` resolves to an entity, parented to that entity. One `transitions` edge per `entityMutationFrom` entry of each event constraint, from that state (or `null` for a creation) to the state the constraint's `data` references.",
  async run(graph) {
    const { locator, context } = graph;
    const model = await graph.get(ModelFact);
    const nodes: GraphRuleNode[] = [];
    const edges: GraphRuleEdge[] = [];
    const warnings: GraphWarning[] = [];

    const states = new Map<string, string>();
    for (const schema of model.schemas.values()) {
      const { definition } = schema;
      const { constraintFor } = definition.extensions;
      const entity =
        definition.kind === 'object' && typeof constraintFor === 'string'
          ? model.entities.get(constraintFor)
          : undefined;
      if (!entity) {
        continue;
      }

      states.set(schema.path, stateId(schema.locator));
      nodes.push({
        layer: 'architecture',
        type: 'state',
        locator: schema.locator,
        parent: entity.id,
        name: definition.name,
        description: definition.description,
        sources: [
          await locator.source(schema.file, [
            ...schema.segments,
            'causa',
            'constraintFor',
          ]),
        ],
      });
    }

    const topics = new Map(
      [...model.topics.values()].map((t) => [t.schemaFilePath, t]),
    );
    for (const { file, segments, definition } of model.schemas.values()) {
      if (definition.kind !== 'object') {
        continue;
      }

      const { constraintFor, entityMutationFrom, entityPropertyChanges } =
        definition.extensions;
      const topic =
        typeof constraintFor === 'string'
          ? topics.get(constraintFor)
          : undefined;
      if (!topic || !Array.isArray(entityMutationFrom)) {
        continue;
      }

      const source = await locator.source(file, segments);
      const data = definition.properties.find((p) => p.name === 'data');
      const target = data?.type.kind === 'ref' ? data.type.ref : undefined;
      const to = target ? states.get(target) : undefined;
      if (!to) {
        warnings.push({
          message: `Event constraint '${definition.name}' has 'entityMutationFrom' but its 'data' ${
            target && model.entities.has(target)
              ? 'references the entity itself rather than a state.'
              : 'does not reference a state.'
          }`,
          sources: [source],
        });
        continue;
      }

      const name = definition.properties.find((p) => p.name === 'name');
      const eventName =
        name?.type.kind === 'const' ? String(name.type.value) : undefined;
      const edgeData: TransitionsGraphEdgeData = {
        eventName,
        propertyChanges: entityPropertyChanges as any,
        topic: topicId(topic.id),
      };

      for (const [index, entry] of entityMutationFrom.entries()) {
        const entrySource = await locator.source(file, [
          ...segments,
          'causa',
          'entityMutationFrom',
          index,
        ]);
        let from: string | null = null;
        if (entry !== null) {
          const state = states.get(entry);
          if (!state) {
            warnings.push({
              message: `Event constraint '${definition.name}' mutates from '${relative(context.rootPath, entry)}', which is not a state.`,
              sources: [entrySource],
            });
            continue;
          }

          from = state;
        }

        edges.push({
          type: 'transitions',
          from,
          to,
          label: eventName,
          description: definition.description,
          sources: [entrySource, source],
          data: edgeData,
        });
      }
    }

    return { nodes, edges, warnings };
  },
};
