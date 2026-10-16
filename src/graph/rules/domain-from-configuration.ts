import {
  GraphOriginKind,
  type GraphRule,
  type GraphRuleDomain,
} from '../../definitions/index.js';
import { DomainsFact } from '../domains.js';

/**
 * A domain per configuration file declaring `domain.name`. The locator is the directory holding the file.
 */
export const domainFromConfiguration: GraphRule = {
  name: 'domainFromConfiguration',
  kind: GraphOriginKind.Declared,
  description:
    'One domain per `causa*.yaml` file declaring `domain.name`. The locator is the directory holding the file.',
  async run(graph) {
    const { locator } = graph;
    const domains = await graph.get(DomainsFact);
    const graphDomains: GraphRuleDomain[] = [];

    for (const domain of domains) {
      graphDomains.push({
        locator: domain.directory,
        name: domain.name,
        description: domain.description,
        sources: [
          await locator.configurationSource(domain.context, ['domain']),
        ],
      });
    }

    return { domains: graphDomains };
  },
};
