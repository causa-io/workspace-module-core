import { relative } from 'path';
import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleEdge,
  type GraphRuleNode,
  type GraphWarning,
} from '../../definitions/index.js';
import { domainOfFile, DomainsFact } from '../domains.js';
import { domainId, topicId } from '../ids.js';
import { ModelFact } from '../model.js';

/**
 * An `entity` node per object schema the system exchanges or persists: carried by a topic (the schema its `data`
 * property references), or persisted (`ModelSchemaExtractDatabase` produced a binding). The parent is the domain of the
 * schema file.
 *
 * Also emits a `carries` edge from each topic carrying the entity, and a `projects` edge from the entity a schema
 * declares it projects (`causa.projectionOf`) to the schema's entity. The extension is a reference to the source schema,
 * declared on the destination.
 */
export const entityFromSchema: GraphRule = {
  name: 'entityFromSchema',
  kind: GraphOriginKind.Declared,
  description:
    "One `entity` node per object schema that a topic carries or that a database binding persists, parented to the domain of its file. One `carries` edge from each topic whose event schema's `data` references it, and one `projects` edge from the entity its `causa.projectionOf` references.",
  async run(graph) {
    const { locator, context } = graph;
    const [domains, model] = await Promise.all([
      graph.get(DomainsFact),
      graph.get(ModelFact),
    ]);
    const nodes: GraphRuleNode[] = [];
    const edges: GraphRuleEdge[] = [];
    const warnings: GraphWarning[] = [];

    for (const entity of model.entities.values()) {
      const { schema, carriedBy } = entity;
      const payloadSources = await Promise.all(
        carriedBy.map((topic) =>
          locator.source(relative(context.rootPath, topic.schemaFilePath), [
            'properties',
            'data',
          ]),
        ),
      );
      const domain = domainOfFile(domains, schema.file);
      nodes.push({
        layer: 'architecture',
        type: 'entity',
        locator: schema.locator,
        parent: domain ? domainId(domain.directory) : undefined,
        name: schema.definition.name,
        description: schema.definition.description,
        sources: [
          await locator.source(schema.file, schema.segments),
          ...payloadSources,
        ],
      });

      for (const [index, topic] of carriedBy.entries()) {
        edges.push({
          type: 'carries',
          from: topicId(topic.id),
          to: entity.id,
          sources: [payloadSources[index]],
        });
      }

      const ref = schema.definition.extensions.projectionOf;
      if (typeof ref !== 'string') {
        continue;
      }

      const source = await locator.source(schema.file, [
        ...schema.segments,
        'causa',
        'projectionOf',
      ]);
      const projected = model.entities.get(ref);
      if (!projected) {
        warnings.push({
          message: `Schema '${schema.definition.name}' declares 'projectionOf' '${relative(context.rootPath, ref)}', which is not an entity.`,
          sources: [source],
        });
        continue;
      }

      edges.push({
        type: 'projects',
        from: projected.id,
        to: entity.id,
        sources: [source],
      });
    }

    return { nodes, edges, warnings };
  },
};
