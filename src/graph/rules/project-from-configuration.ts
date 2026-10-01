import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleNode,
  type ProjectGraphNodeData,
} from '../../definitions/index.js';
import { domainId } from '../ids.js';
import { ProjectsFact } from '../projects.js';

/**
 * A `project` node per directory whose configuration declares `project.name`, with `project.type` and
 * `project.language` as data. The parent is the domain the project belongs to.
 */
export const projectFromConfiguration: GraphRule = {
  name: 'projectFromConfiguration',
  kind: GraphOriginKind.Declared,
  description:
    'One `project` node per `causa.yaml` declaring `project.name`, parented to the `domain` it belongs to.',
  async run(graph) {
    const { locator } = graph;
    const projects = await graph.get(ProjectsFact);
    const nodes: GraphRuleNode[] = [];

    for (const project of projects) {
      const { context, type, language } = project;
      const data: ProjectGraphNodeData = { type, language };
      nodes.push({
        layer: 'architecture',
        type: 'project',
        locator: project.directory,
        parent: project.domain ? domainId(project.domain.directory) : undefined,
        name: project.name,
        description: context.get('project.description'),
        sources: [await locator.configurationSource(context, ['project'])],
        data,
      });
    }

    return { nodes };
  },
};
