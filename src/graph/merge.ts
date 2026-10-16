import type {
  Graph,
  GraphDanglingReference,
  GraphDomain,
  GraphEdge,
  GraphLayer,
  GraphNode,
  GraphOrigin,
  GraphOriginSource,
  GraphRuleDomain,
  GraphRuleEdge,
  GraphRuleNode,
  GraphRuleReport,
  GraphWarning,
} from '../definitions/index.js';
import { nodeId, type GraphNodeEntry } from './ids.js';
import type { GraphRuleResult } from './rule.js';

/**
 * The position of each layer in the graph.
 */
const LAYER_ORDER: Record<GraphLayer, number> = {
  architecture: 0,
  infrastructure: 1,
  model: 2,
  code: 3,
};

/**
 * A node of the graph being built, along with the fields used to group and sort it.
 * The node is replaced when other rules emit it.
 */
type NodeRecord = Omit<GraphNodeEntry, 'id' | 'node'> & { node: GraphNode };

/**
 * An edge of the graph being built, along with the type used to group and sort it.
 */
type EdgeRecord = Pick<GraphRuleEdge, 'type'> & { readonly edge: GraphEdge };

/**
 * Merges the given sources into a list of sources, skipping those already present.
 */
function mergeSources(
  into: GraphOriginSource[],
  from: GraphOriginSource[],
): void {
  for (const source of from) {
    if (
      !into.some(
        (s) =>
          s.path === source.path &&
          (s.pointer ?? '') === (source.pointer ?? ''),
      )
    ) {
      into.push(source);
    }
  }
}

/**
 * Returns the origin of an element emitted by a rule.
 */
function originOf(
  rule: GraphRuleResult,
  sources: GraphOriginSource[],
): GraphOrigin {
  return { kind: rule.kind, rule: rule.name, sources: [...sources] };
}

/**
 * Returns the key identifying an edge emitted by a rule. Edges with the same key are merged.
 * The rule is part of the key: identical edges from different rules are distinct assertions.
 */
function edgeKey(rule: GraphRuleResult, edge: GraphRuleEdge): string {
  return JSON.stringify([
    edge.type,
    edge.from,
    edge.to,
    rule.name,
    rule.kind,
    edge.data ?? null,
  ]);
}

/**
 * Builds the architecture graph from the results of all the rules that ran.
 *
 * Rules are processed in order. When several rules emit the same domain or node, the first emission defines its name,
 * parent, domain, and origin. Later emissions only fill in the description, data, and domain when missing, and all
 * sources are merged. Identical edges emitted by the same rule are merged.
 *
 * A node that does not name a domain inherits the domain of its closest ancestor naming one.
 *
 * @param results The results of all the rules, in the order they ran.
 * @param header The name and description of the graph.
 * @returns The graph, sorted for stable diffs, and the reports of the rules.
 */
export function buildGraph(
  results: readonly GraphRuleResult[],
  header: Pick<Graph, 'name' | 'description'> = {},
): { graph: Graph; rules: GraphRuleReport[] } {
  const domains = new Map<string, GraphDomain>();
  const nodes = new Map<string, NodeRecord>();
  const edges = new Map<string, EdgeRecord>();

  const accepted = results.map((rule) => {
    const warnings = [...rule.warnings];
    for (const domain of rule.domains) {
      addDomain(domains, rule, domain);
    }

    const ruleNodes = rule.nodes.filter((node) => {
      const id = nodeId(node.type, node.locator);
      const existing = nodes.get(id);
      if (existing && existing.layer !== node.layer) {
        warnings.push({
          message: `Node '${id}' is emitted in layer '${node.layer}' but already exists in layer '${existing.layer}'. It is ignored.`,
          sources: node.sources,
        });
        return false;
      }

      const warning = addNode(nodes, id, rule, node);
      if (warning) {
        warnings.push(warning);
      }
      return true;
    });

    const ruleEdges = new Map<string, GraphRuleEdge>();
    for (const edge of rule.edges) {
      const key = edgeKey(rule, edge);
      ruleEdges.set(key, edge);
      addEdge(edges, key, rule, edge);
    }

    return { rule, warnings, nodes: ruleNodes, edges: [...ruleEdges.values()] };
  });

  const inheritanceWarnings = inheritDomains(nodes);
  const rules: GraphRuleReport[] = accepted.map(
    ({ rule, warnings, nodes: ruleNodes, edges: ruleEdges }) => ({
      name: rule.name,
      kind: rule.kind,
      description: rule.description,
      domains: new Set(rule.domains.map((d) => d.locator)).size,
      nodes: new Set(ruleNodes.map((n) => nodeId(n.type, n.locator))).size,
      edges: ruleEdges.length,
      warnings: [...warnings, ...(inheritanceWarnings.get(rule.name) ?? [])],
      dangling: danglingReferences(domains, nodes, ruleNodes, ruleEdges),
    }),
  );

  return { graph: toGraph(domains, nodes, edges, header), rules };
}

/**
 * Adds a domain emitted by a rule to the graph, or merges it into an existing domain with the same locator.
 */
function addDomain(
  domains: Map<string, GraphDomain>,
  rule: GraphRuleResult,
  { locator, name, description, sources }: GraphRuleDomain,
): void {
  const existing = domains.get(locator);
  if (!existing) {
    domains.set(locator, {
      name,
      description,
      origin: originOf(rule, sources),
    });
    return;
  }

  mergeSources(existing.origin.sources, sources);
  domains.set(locator, {
    ...existing,
    description: existing.description ?? description,
  });
}

/**
 * Adds a node emitted by a rule to the graph, or merges it into an existing node with the same ID.
 *
 * @returns A warning when the node is emitted with a domain other than the one it already belongs to.
 */
function addNode(
  nodes: Map<string, NodeRecord>,
  id: string,
  rule: GraphRuleResult,
  {
    layer,
    type,
    locator,
    parent,
    domain,
    name,
    description,
    tags,
    data,
    sources,
  }: GraphRuleNode,
): GraphWarning | undefined {
  const existing = nodes.get(id);
  if (!existing) {
    const origin = originOf(rule, sources);
    const node = { parent, domain, name, description, origin, tags, data };
    nodes.set(id, { layer, type, locator, node });
    return;
  }

  mergeSources(existing.node.origin.sources, sources);
  existing.node = {
    ...existing.node,
    domain: existing.node.domain ?? domain,
    description: existing.node.description ?? description,
    data: existing.node.data ?? data,
  };

  if (
    domain !== undefined &&
    existing.node.domain !== undefined &&
    domain !== existing.node.domain
  ) {
    return {
      message: `Node '${id}' is emitted in domain '${domain}' but already belongs to domain '${existing.node.domain}'. The domain is ignored.`,
      sources,
    };
  }
}

/**
 * Sets the domain of each node that does not name one to the domain of its closest ancestor naming one.
 *
 * @param nodes The nodes of the graph, whose domains are updated.
 * @returns The warnings about nodes naming a domain other than the one of their parent, keyed by the name of the rule
 *   that emitted the node first.
 */
function inheritDomains(
  nodes: Map<string, NodeRecord>,
): Map<string, GraphWarning[]> {
  const resolved = new Map<string, string | undefined>();
  const resolve = (id: string): string | undefined => {
    const chain: string[] = [];
    let domain: string | undefined;
    for (
      let current: string | undefined = id;
      current !== undefined && !chain.includes(current);
      current = nodes.get(current)?.node.parent
    ) {
      if (resolved.has(current)) {
        domain = resolved.get(current);
        break;
      }

      chain.push(current);
      domain = nodes.get(current)?.node.domain;
      if (domain !== undefined) {
        break;
      }
    }

    chain.forEach((c) => resolved.set(c, resolved.get(c) ?? domain));
    return domain;
  };

  const warnings = new Map<string, GraphWarning[]>();
  for (const [id, record] of nodes) {
    const { parent, domain, origin } = record.node;
    const parentDomain = parent !== undefined ? resolve(parent) : undefined;
    if (domain === undefined) {
      if (parentDomain !== undefined) {
        record.node = { ...record.node, domain: parentDomain };
      }
      continue;
    }

    if (parentDomain !== undefined && parentDomain !== domain) {
      const ruleWarnings = warnings.get(origin.rule) ?? [];
      ruleWarnings.push({
        message: `Node '${id}' belongs to domain '${domain}', but its parent '${parent}' belongs to domain '${parentDomain}'.`,
        sources: origin.sources,
      });
      warnings.set(origin.rule, ruleWarnings);
    }
  }

  return warnings;
}

/**
 * Adds an edge emitted by a rule to the graph, or merges its sources into an existing edge with the same key.
 */
function addEdge(
  edges: Map<string, EdgeRecord>,
  key: string,
  rule: GraphRuleResult,
  { type, from, to, label, description, data, sources }: GraphRuleEdge,
): void {
  const existing = edges.get(key);
  if (existing) {
    mergeSources(existing.edge.origin.sources, sources);
    return;
  }

  const origin = originOf(rule, sources);
  const edge = { from, to, label, description, origin, data };
  edges.set(key, { type, edge });
}

/**
 * Returns the references held by the given nodes and edges to domains and nodes that do not exist in the graph.
 */
function danglingReferences(
  domains: Map<string, GraphDomain>,
  nodes: Map<string, NodeRecord>,
  ruleNodes: GraphRuleNode[],
  ruleEdges: GraphRuleEdge[],
): GraphDanglingReference[] {
  const dangling = new Map<string, GraphDanglingReference>();

  for (const { type, locator, parent, domain } of ruleNodes) {
    const node = nodeId(type, locator);
    if (parent !== undefined && !nodes.has(parent)) {
      dangling.set(JSON.stringify([node, 'parent', parent]), {
        id: parent,
        field: 'parent',
        node,
      });
    }

    if (domain !== undefined && !domains.has(domain)) {
      dangling.set(JSON.stringify([node, 'domain', domain]), {
        id: domain,
        field: 'domain',
        node,
      });
    }
  }

  for (const { type, from, to } of ruleEdges) {
    for (const [field, end] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (end !== null && !nodes.has(end)) {
        dangling.set(JSON.stringify([type, from, to, field]), {
          id: end,
          field,
          edge: { type, from, to },
        });
      }
    }
  }

  return [...dangling.values()];
}

/**
 * Keys the domains by locator, groups the nodes by layer, type, and locator, and the edges by type, sorting them for
 * stable diffs.
 */
function toGraph(
  domainRecords: Map<string, GraphDomain>,
  nodeRecords: Map<string, NodeRecord>,
  edgeRecords: Map<string, EdgeRecord>,
  header: Pick<Graph, 'name' | 'description'>,
): Graph {
  const domains = Object.fromEntries(
    [...domainRecords.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );

  const nodes: Record<string, Record<string, Record<string, GraphNode>>> = {};
  const sortedNodes = [...nodeRecords.values()].sort(
    (a, b) =>
      LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
      a.type.localeCompare(b.type) ||
      a.locator.localeCompare(b.locator),
  );
  for (const { layer, type, locator, node } of sortedNodes) {
    ((nodes[layer] ??= {})[type] ??= {})[locator] = node;
  }

  const edges: Record<string, GraphEdge[]> = {};
  const sortedEdges = [...edgeRecords.values()].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      (a.edge.from ?? '').localeCompare(b.edge.from ?? '') ||
      (a.edge.to ?? '').localeCompare(b.edge.to ?? '') ||
      a.edge.origin.rule.localeCompare(b.edge.origin.rule),
  );
  for (const { type, edge } of sortedEdges) {
    (edges[type] ??= []).push(edge);
  }

  return { ...header, domains, nodes, edges };
}
