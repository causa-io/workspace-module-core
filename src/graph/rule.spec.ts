import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { pino } from 'pino';
import { GraphOriginKind, type GraphRule } from '../definitions/index.js';
import {
  GraphContext,
  GraphExtractionFact,
  type GraphFactOutput,
} from './context.js';
import { runGraphRules } from './rule.js';

describe('runGraphRules', () => {
  let graph: GraphContext;

  beforeEach(() => {
    const { context } = createContext({
      configuration: { workspace: { name: '📦' } },
      logger: pino({ level: 'silent' }),
    });
    graph = new GraphContext(context);
  });

  it('should return the outputs of the rules', async () => {
    const rule: GraphRule = {
      name: 'projectRule',
      kind: GraphOriginKind.Declared,
      description: 'Emits a project.',
      run: ({ context }) => ({
        nodes: [
          {
            layer: 'architecture',
            type: 'project',
            locator: 'my-project',
            name: context.get('workspace.name'),
            sources: [{ path: 'causa.yaml', pointer: '/project' }],
          },
        ],
        edges: [
          {
            type: 'publishes',
            from: 'project:my-project',
            to: 'topic:my-topic',
            sources: [{ path: 'causa.yaml' }],
          },
        ],
        warnings: [{ message: '⚠️' }],
      }),
    };

    const actualResults = await runGraphRules([rule], graph);

    expect(actualResults).toEqual([
      {
        name: 'projectRule',
        kind: 'declared',
        description: 'Emits a project.',
        nodes: [
          {
            layer: 'architecture',
            type: 'project',
            locator: 'my-project',
            name: '📦',
            sources: [{ path: 'causa.yaml', pointer: '/project' }],
          },
        ],
        edges: [
          {
            type: 'publishes',
            from: 'project:my-project',
            to: 'topic:my-topic',
            sources: [{ path: 'causa.yaml' }],
          },
        ],
        warnings: [{ message: '⚠️' }],
      },
    ]);
  });

  it('should turn a failing rule into a warning and run the other rules', async () => {
    const failing: GraphRule = {
      name: 'failingRule',
      kind: GraphOriginKind.Inferred,
      description: 'Fails.',
      run: async () => {
        throw new Error('💥');
      },
    };
    const empty: GraphRule = {
      name: 'authoredFromFiles',
      kind: GraphOriginKind.Authored,
      description: 'Emits nothing.',
      run: () => ({}),
    };

    const actualResults = await runGraphRules([failing, empty], graph);

    expect(actualResults).toEqual([
      {
        name: 'failingRule',
        kind: 'inferred',
        description: 'Fails.',
        nodes: [],
        edges: [],
        warnings: [{ message: 'The rule failed: 💥' }],
      },
      {
        name: 'authoredFromFiles',
        kind: 'authored',
        description: 'Emits nothing.',
        nodes: [],
        edges: [],
        warnings: [],
      },
    ]);
  });

  it('should not report a failed fact in the rules depending on it', async () => {
    class FailingFact extends GraphExtractionFact<string> {
      compute(): GraphFactOutput<string> {
        throw new Error('💥');
      }
    }
    const rule: GraphRule = {
      name: 'dependentRule',
      kind: GraphOriginKind.Declared,
      description: 'Depends on the fact.',
      run: async (graph) => ({
        warnings: [{ message: await graph.get(FailingFact) }],
      }),
    };

    const actualResults = await runGraphRules([rule, rule], graph);

    expect(actualResults.map((r) => r.warnings)).toEqual([[], []]);
    expect(graph.failures).toEqual([{ name: 'FailingFact', message: '💥' }]);
  });
});
