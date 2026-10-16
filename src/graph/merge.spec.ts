import { createContext } from '@causa/workspace/testing';
import { pino } from 'pino';
import { GraphOriginKind, type GraphRule } from '../definitions/index.js';
import { GraphContext } from './context.js';
import { buildGraph } from './merge.js';
import { runGraphRules, type GraphRuleResult } from './rule.js';

describe('buildGraph', () => {
  async function fragment(...rules: GraphRule[]): Promise<GraphRuleResult[]> {
    const { context } = createContext({ logger: pino({ level: 'silent' }) });
    return await runGraphRules(rules, new GraphContext(context));
  }

  const projectRule: GraphRule = {
    name: 'projectRule',
    kind: GraphOriginKind.Declared,
    description: 'Emits a project.',
    run: () => ({
      nodes: [
        {
          layer: 'architecture',
          type: 'project',
          locator: 'my-project',
          name: 'My project',
          sources: [{ path: 'causa.yaml', pointer: '/project' }],
        },
      ],
    }),
  };

  it('should build the graph and report the rules', async () => {
    const input = await fragment(projectRule);

    const actualResult = buildGraph(input, { name: 'shop' });

    expect(actualResult).toEqual({
      graph: {
        name: 'shop',
        domains: {},
        nodes: {
          architecture: {
            project: {
              'my-project': {
                name: 'My project',
                origin: {
                  kind: 'declared',
                  rule: 'projectRule',
                  sources: [{ path: 'causa.yaml', pointer: '/project' }],
                },
              },
            },
          },
        },
        edges: {},
      },
      rules: [
        {
          name: 'projectRule',
          kind: 'declared',
          description: 'Emits a project.',
          domains: 0,
          nodes: 1,
          edges: 0,
          warnings: [],
          dangling: [],
        },
      ],
    });
  });

  it('should keep the name and parent of the first emission of a node and merge sources', async () => {
    const other: GraphRule = {
      name: 'otherRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits the same node.',
      run: () => ({
        nodes: [
          {
            layer: 'architecture',
            type: 'project',
            locator: 'my-project',
            parent: 'project:other',
            name: 'Other name',
            description: 'A description.',
            sources: [
              { path: 'causa.yaml', pointer: '/project' },
              { path: 'main.tf', pointer: 'module.service' },
            ],
          },
        ],
      }),
    };
    const input = await fragment(projectRule, other);

    const { graph, rules } = buildGraph(input);

    expect(graph.nodes?.architecture?.project?.['my-project']).toEqual({
      name: 'My project',
      description: 'A description.',
      origin: {
        kind: 'declared',
        rule: 'projectRule',
        sources: [
          { path: 'causa.yaml', pointer: '/project' },
          { path: 'main.tf', pointer: 'module.service' },
        ],
      },
    });
    expect(rules[1]).toMatchObject({
      name: 'otherRule',
      nodes: 1,
      dangling: [
        { id: 'project:other', field: 'parent', node: 'project:my-project' },
      ],
    });
  });

  it('should ignore a node emitted in a different layer, with a warning', async () => {
    const clashing: GraphRule = {
      name: 'clashingRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits the project in another layer.',
      run: () => ({
        nodes: [
          {
            layer: 'infrastructure',
            type: 'project',
            locator: 'my-project',
            name: '🙅',
            sources: [{ path: 'main.tf' }],
          },
        ],
      }),
    };
    const input = await fragment(projectRule, clashing);

    const { graph, rules } = buildGraph(input);

    expect(graph.nodes).toEqual({
      architecture: { project: { 'my-project': expect.any(Object) } },
    });
    expect(rules[1]).toMatchObject({
      nodes: 0,
      warnings: [
        {
          message:
            "Node 'project:my-project' is emitted in layer 'infrastructure' but already exists in layer 'architecture'. It is ignored.",
          sources: [{ path: 'main.tf' }],
        },
      ],
    });
  });

  it('should merge identical edges of a rule and report its dangling references', async () => {
    const edgeRule: GraphRule = {
      name: 'edgeRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits edges.',
      run: () => {
        const edge = {
          type: 'publishes',
          from: 'project:my-project',
          to: 'topic:missing',
          sources: [{ path: 'causa.yaml' }],
        };
        return {
          nodes: [
            {
              layer: 'architecture',
              type: 'state',
              locator: 'my-state',
              parent: 'entity:missing',
              name: 'My state',
              sources: [{ path: 'state.yaml' }],
            },
          ],
          edges: [
            edge,
            { ...edge, sources: [{ path: 'other.yaml' }] },
            {
              type: 'transitions',
              from: null,
              to: 'state:my-state',
              sources: [{ path: 'state.yaml' }],
            },
          ],
        };
      },
    };
    const input = await fragment(projectRule, edgeRule);

    const { graph, rules } = buildGraph(input);

    expect(graph.edges?.publishes).toEqual([
      {
        from: 'project:my-project',
        to: 'topic:missing',
        origin: {
          kind: 'declared',
          rule: 'edgeRule',
          sources: [{ path: 'causa.yaml' }, { path: 'other.yaml' }],
        },
      },
    ]);
    expect(rules).toEqual([
      expect.objectContaining({ name: 'projectRule', dangling: [] }),
      expect.objectContaining({
        name: 'edgeRule',
        nodes: 1,
        edges: 2,
        dangling: [
          {
            id: 'entity:missing',
            field: 'parent',
            node: 'state:my-state',
          },
          {
            id: 'topic:missing',
            field: 'to',
            edge: {
              type: 'publishes',
              from: 'project:my-project',
              to: 'topic:missing',
            },
          },
        ],
      }),
    ]);
  });

  it('should merge the domains emitted by several rules', async () => {
    const domainRule = (name: string, description?: string): GraphRule => ({
      name,
      kind: GraphOriginKind.Declared,
      description: 'Emits domains.',
      run: () => ({
        domains: [
          {
            locator: 'domains/shipping',
            name: `Shipping from ${name}`,
            description,
            sources: [{ path: `domains/shipping/${name}.yaml` }],
          },
          {
            locator: 'domains/ordering',
            name: 'Ordering',
            sources: [{ path: 'domains/ordering/causa.yaml' }],
          },
        ],
      }),
    });
    const input = await fragment(
      domainRule('first'),
      domainRule('second', '📦'),
    );

    const { graph, rules } = buildGraph(input);

    expect(graph.domains).toEqual({
      'domains/ordering': {
        name: 'Ordering',
        origin: {
          kind: 'declared',
          rule: 'first',
          sources: [{ path: 'domains/ordering/causa.yaml' }],
        },
      },
      'domains/shipping': {
        name: 'Shipping from first',
        description: '📦',
        origin: {
          kind: 'declared',
          rule: 'first',
          sources: [
            { path: 'domains/shipping/first.yaml' },
            { path: 'domains/shipping/second.yaml' },
          ],
        },
      },
    });
    expect(Object.keys(graph.domains ?? {})).toEqual([
      'domains/ordering',
      'domains/shipping',
    ]);
    expect(rules.map((r) => r.domains)).toEqual([2, 2]);
  });

  it('should set the domain of nodes from their closest ancestor naming one', async () => {
    const node = (
      type: string,
      locator: string,
      fields: { parent?: string; domain?: string } = {},
    ) => ({
      layer: 'architecture' as const,
      type,
      locator,
      name: locator,
      ...fields,
      sources: [{ path: `${locator}.yaml` }],
    });
    const treeRule: GraphRule = {
      name: 'treeRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits a tree of nodes.',
      run: () => ({
        domains: [
          { locator: 'ordering', name: 'Ordering', sources: [{ path: 'o' }] },
          { locator: 'shipping', name: 'Shipping', sources: [{ path: 's' }] },
        ],
        nodes: [
          node('trigger', 'grandchild', { parent: 'api:child' }),
          node('api', 'child', { parent: 'project:root' }),
          node('project', 'root', { domain: 'ordering' }),
          node('api', 'other', { parent: 'project:root', domain: 'shipping' }),
          node('project', 'shared'),
          node('api', 'owned', {
            parent: 'project:shared',
            domain: 'ordering',
          }),
          node('project', 'unknown', { domain: 'missing' }),
        ],
      }),
    };
    const conflictingRule: GraphRule = {
      name: 'conflictingRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits a node in another domain.',
      run: () => ({
        nodes: [
          node('project', 'root', { domain: 'shipping' }),
          node('project', 'shared', { domain: 'shipping' }),
        ],
      }),
    };
    const input = await fragment(treeRule, conflictingRule);

    const { graph, rules } = buildGraph(input);

    const domainsOf = (nodes: Record<string, { domain?: string }> = {}) =>
      Object.fromEntries(
        Object.entries(nodes).map(([locator, n]) => [locator, n.domain]),
      );
    expect(domainsOf(graph.nodes?.architecture?.project)).toEqual({
      root: 'ordering',
      shared: 'shipping',
      unknown: 'missing',
    });
    expect(domainsOf(graph.nodes?.architecture?.api)).toEqual({
      child: 'ordering',
      other: 'shipping',
      owned: 'ordering',
    });
    expect(domainsOf(graph.nodes?.architecture?.trigger)).toEqual({
      grandchild: 'ordering',
    });
    expect(rules).toEqual([
      expect.objectContaining({
        name: 'treeRule',
        warnings: [
          {
            message:
              "Node 'api:other' belongs to domain 'shipping', but its parent 'project:root' belongs to domain 'ordering'.",
            sources: [{ path: 'other.yaml' }],
          },
          {
            message:
              "Node 'api:owned' belongs to domain 'ordering', but its parent 'project:shared' belongs to domain 'shipping'.",
            sources: [{ path: 'owned.yaml' }],
          },
        ],
        dangling: [{ id: 'missing', field: 'domain', node: 'project:unknown' }],
      }),
      expect.objectContaining({
        name: 'conflictingRule',
        warnings: [
          {
            message:
              "Node 'project:root' is emitted in domain 'shipping' but already belongs to domain 'ordering'. The domain is ignored.",
            sources: [{ path: 'root.yaml' }],
          },
        ],
        dangling: [],
      }),
    ]);
  });
});
