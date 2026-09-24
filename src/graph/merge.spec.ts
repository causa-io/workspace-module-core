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
            parent: 'domain:other',
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
        { id: 'domain:other', field: 'parent', node: 'project:my-project' },
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
});
