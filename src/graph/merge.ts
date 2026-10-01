import type {
  Graph,
  GraphDanglingReference,
  GraphEdge,
  GraphLayer,
  GraphNode,
  GraphOrigin,
  GraphOriginSource,
  GraphRuleEdge,
  GraphRuleNode,
  GraphRuleReport,
} from '../definitions/index.js';
import { nodeId } from './ids.js';
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
 */
type NodeRecord = Pick<GraphRuleNode, 'layer' | 'type' | 'locator'> & {
  node: GraphNode;
};

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
 * Rules are processed in order. When several rules emit the same node, the first emission defines its name, parent, and
 * origin. Later emissions only fill in the description and data when missing, and all sources are merged.
 * Identical edges emitted by the same rule are merged.
 *
 * @param results The results of all the rules, in the order they ran.
 * @param header The name and description of the graph.
 * @returns The graph, sorted for stable diffs, and the reports of the rules.
 */
export function buildGraph(
  results: readonly GraphRuleResult[],
  header: Pick<Graph, 'name' | 'description'> = {},
): { graph: Graph; rules: GraphRuleReport[] } {
  const nodes = new Map<string, NodeRecord>();
  const edges = new Map<string, EdgeRecord>();

  const accepted = results.map((rule) => {
    const warnings = [...rule.warnings];
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

      addNode(nodes, id, rule, node);
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

  const rules: GraphRuleReport[] = accepted.map(
    ({ rule, warnings, nodes: ruleNodes, edges: ruleEdges }) => ({
      name: rule.name,
      kind: rule.kind,
      description: rule.description,
      nodes: new Set(ruleNodes.map((n) => nodeId(n.type, n.locator))).size,
      edges: ruleEdges.length,
      warnings,
      dangling: danglingReferences(nodes, ruleNodes, ruleEdges),
    }),
  );

  return { graph: toGraph(nodes, edges, header), rules };
}

/**
 * Adds a node emitted by a rule to the graph, or merges it into an existing node with the same ID.
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
    name,
    description,
    tags,
    data,
    sources,
  }: GraphRuleNode,
): void {
  const existing = nodes.get(id);
  if (!existing) {
    const origin = originOf(rule, sources);
    const node = { parent, name, description, origin, tags, data };
    nodes.set(id, { layer, type, locator, node });
    return;
  }

  mergeSources(existing.node.origin.sources, sources);
  existing.node = {
    ...existing.node,
    description: existing.node.description ?? description,
    data: existing.node.data ?? data,
  };
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
 * Returns the references held by the given nodes and edges to nodes that do not exist in the graph.
 */
function danglingReferences(
  nodes: Map<string, NodeRecord>,
  ruleNodes: GraphRuleNode[],
  ruleEdges: GraphRuleEdge[],
): GraphDanglingReference[] {
  const dangling = new Map<string, GraphDanglingReference>();

  for (const { type, locator, parent } of ruleNodes) {
    if (parent !== undefined && !nodes.has(parent)) {
      const node = nodeId(type, locator);
      dangling.set(JSON.stringify([node, parent]), {
        id: parent,
        field: 'parent',
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
 * Groups the nodes by layer, type, and locator, and the edges by type, sorting them for stable diffs.
 */
function toGraph(
  nodeRecords: Map<string, NodeRecord>,
  edgeRecords: Map<string, EdgeRecord>,
  header: Pick<Graph, 'name' | 'description'>,
): Graph {
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

  return { ...header, nodes, edges };
}
