import { relative } from 'path';
import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleNode,
} from '../../definitions/index.js';
import { ModelFact } from '../model.js';

/**
 * A `topic` node per event topic, as `EventTopicList` finds them: the files matched by `events.topics.globs`, with the
 * ID rendered by `events.topics.format`, in the domain of the schema file.
 */
export const eventTopicFromSchemaPath: GraphRule = {
  name: 'eventTopicFromSchemaPath',
  kind: GraphOriginKind.Declared,
  description:
    'One `topic` node per file matched by `events.topics.globs`, in the domain of the file.',
  async run(graph) {
    const { locator, context } = graph;
    const model = await graph.get(ModelFact);
    const nodes: GraphRuleNode[] = [];

    for (const topic of model.topics.values()) {
      const file = relative(context.rootPath, topic.schemaFilePath);
      nodes.push({
        layer: 'architecture',
        type: 'topic',
        locator: topic.id,
        domain: topic.domain?.directory,
        name: topic.id,
        description: topic.schema?.definition.description,
        sources: [
          { path: file },
          await locator.configurationSource(context, ['events', 'topics']),
        ],
      });
    }

    return { nodes };
  },
};
