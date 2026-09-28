import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleNode,
} from '../../definitions/index.js';
import { DomainsFact } from '../domains.js';

/**
 * A `domain` node per configuration file declaring `domain.name`. The locator is the directory holding the file.
 */
export const domainFromConfiguration: GraphRule = {
  name: 'domainFromConfiguration',
  kind: GraphOriginKind.Declared,
  description:
    'One `domain` node per `causa*.yaml` file declaring `domain.name`. The locator is the directory holding the file.',
  async run(graph) {
    const { locator } = graph;
    const domains = await graph.get(DomainsFact);
    const nodes: GraphRuleNode[] = [];

    for (const domain of domains) {
      nodes.push({
        layer: 'architecture',
        type: 'domain',
        locator: domain.directory,
        name: domain.name,
        description: domain.description,
        sources: [
          await locator.configurationSource(domain.context, ['domain']),
        ],
      });
    }

    return { nodes };
  },
};
