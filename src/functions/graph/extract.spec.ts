import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pino } from 'pino';
import { parse } from 'yaml';
import {
  GraphExtract,
  GraphListRules,
  GraphOriginKind,
  type GraphRule,
} from '../../definitions/index.js';
import { GraphFact, type GraphFactOutput } from '../../graph/index.js';
import { GraphExtractForAll } from './extract.js';

const origin = (rule: string, path: string) => ({
  kind: GraphOriginKind.Declared,
  rule,
  sources: [{ path }],
});

class ProjectNameFact extends GraphFact<string> {
  compute(): GraphFactOutput<string> {
    return {
      value: 'ordering-api',
      warnings: [
        {
          message: '🔍',
          sources: [{ path: 'domains/ordering/api/causa.yaml' }],
        },
      ],
    };
  }
}

const projectRule: GraphRule = {
  name: 'projectRule',
  kind: GraphOriginKind.Declared,
  description: 'Projects.',
  run: async (graph) => ({
    nodes: [
      {
        layer: 'architecture',
        type: 'project',
        locator: 'domains/ordering/api',
        parent: 'domain:domains/ordering',
        name: await graph.get(ProjectNameFact),
        sources: [{ path: 'domains/ordering/api/causa.yaml' }],
      },
    ],
  }),
};

class FailingFact extends GraphFact<string> {
  compute(): GraphFactOutput<string> {
    throw new Error('💥');
  }
}

class BrokenFact extends GraphFact<string> {
  compute(): GraphFactOutput<string> {
    throw new Error('🔨');
  }
}

const serviceRule: GraphRule = {
  name: 'serviceRule',
  kind: GraphOriginKind.Declared,
  description: 'Services.',
  run: () => ({
    nodes: [
      {
        layer: 'infrastructure',
        type: 'service',
        locator: 'domains/ordering/api#ordering-api',
        name: 'ordering-api',
        sources: [{ path: 'infrastructure/main.tf' }],
      },
      {
        layer: 'architecture',
        type: 'project',
        locator: 'domains/ordering/api',
        name: '🙈',
        sources: [{ path: 'infrastructure/main.tf' }],
      },
    ],
    edges: [
      {
        type: 'publishes',
        from: 'service:domains/ordering/api#ordering-api',
        to: 'brokerTopic:missing',
        sources: [{ path: 'infrastructure/main.tf' }],
      },
      {
        type: 'realizes',
        from: 'service:domains/ordering/api#ordering-api',
        to: 'project:domains/ordering/api',
        sources: [{ path: 'infrastructure/main.tf' }],
      },
    ],
    warnings: [
      { message: '⚠️', sources: [{ path: 'infrastructure/main.tf' }] },
    ],
  }),
};

const factRule: GraphRule = {
  name: 'factRule',
  kind: GraphOriginKind.Declared,
  description: 'Depends on failing facts.',
  run: async (graph) => {
    const messages = await Promise.all([
      graph.get(FailingFact),
      graph.get(BrokenFact),
    ]);
    return { warnings: messages.map((message) => ({ message })) };
  },
};

class GoogleRules extends GraphListRules {
  _call(): GraphRule[] {
    return [serviceRule, factRule];
  }

  _supports(): boolean {
    return true;
  }
}

class FailingRules extends GraphListRules {
  _call(): GraphRule[] {
    throw new Error('💥');
  }

  _supports(): boolean {
    return true;
  }
}

class CoreRules extends GraphListRules {
  _call(): GraphRule[] {
    return [projectRule];
  }

  _supports(): boolean {
    return true;
  }
}

describe('GraphExtractForAll', () => {
  let rootPath: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-tests-')));
    ({ context } = createContext({
      workingDirectory: rootPath,
      rootPath,
      projectPath: null,
      configuration: { workspace: { name: 'shop' } },
      logger: pino({ level: 'silent' }),
      functions: [GraphExtractForAll, GoogleRules, FailingRules, CoreRules],
    }));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('should merge the results of the rules in the order of the implementations and report them', async () => {
    const actualResult = await context.call(GraphExtract, {});

    expect(actualResult.graph).toEqual({
      name: 'shop',
      description: expect.any(String),
      nodes: {
        architecture: {
          project: {
            'domains/ordering/api': {
              parent: 'domain:domains/ordering',
              name: 'ordering-api',
              origin: {
                kind: 'declared',
                rule: 'projectRule',
                sources: [
                  { path: 'domains/ordering/api/causa.yaml' },
                  { path: 'infrastructure/main.tf' },
                ],
              },
            },
          },
        },
        infrastructure: {
          service: {
            'domains/ordering/api#ordering-api': {
              name: 'ordering-api',
              origin: origin('serviceRule', 'infrastructure/main.tf'),
            },
          },
        },
      },
      edges: {
        publishes: [
          {
            from: 'service:domains/ordering/api#ordering-api',
            to: 'brokerTopic:missing',
            origin: origin('serviceRule', 'infrastructure/main.tf'),
          },
        ],
        realizes: [
          {
            from: 'service:domains/ordering/api#ordering-api',
            to: 'project:domains/ordering/api',
            origin: origin('serviceRule', 'infrastructure/main.tf'),
          },
        ],
      },
    });
    expect(actualResult.rules).toEqual([
      {
        name: 'projectRule',
        kind: 'declared',
        description: 'Projects.',
        nodes: 1,
        edges: 0,
        warnings: [],
        dangling: [
          {
            id: 'domain:domains/ordering',
            field: 'parent',
            node: 'project:domains/ordering/api',
          },
        ],
      },
      {
        name: 'serviceRule',
        kind: 'declared',
        description: 'Services.',
        nodes: 2,
        edges: 2,
        warnings: [
          { message: '⚠️', sources: [{ path: 'infrastructure/main.tf' }] },
        ],
        dangling: [
          {
            id: 'brokerTopic:missing',
            field: 'to',
            edge: {
              type: 'publishes',
              from: 'service:domains/ordering/api#ordering-api',
              to: 'brokerTopic:missing',
            },
          },
        ],
      },
      {
        name: 'factRule',
        kind: 'declared',
        description: 'Depends on failing facts.',
        nodes: 0,
        edges: 0,
        warnings: [],
        dangling: [],
      },
    ]);
    expect(actualResult.facts).toEqual([
      {
        name: 'ProjectNameFact',
        warnings: [
          {
            message: '🔍',
            sources: [{ path: 'domains/ordering/api/causa.yaml' }],
          },
        ],
      },
    ]);
    expect(actualResult.failures).toEqual([
      { extraction: 'FailingRules', message: '💥' },
      { extraction: 'BrokenFact', message: '🔨' },
      { extraction: 'FailingFact', message: '💥' },
    ]);
  });

  it('should extract the graph without the selected environment', async () => {
    const { context: environmentContext } = createContext({
      workingDirectory: rootPath,
      rootPath,
      projectPath: null,
      environment: 'dev',
      configuration: { workspace: { name: 'shop' } },
      logger: pino({ level: 'silent' }),
      functions: [GraphExtractForAll, CoreRules],
    });
    jest.spyOn(environmentContext, 'clone').mockResolvedValueOnce(context);

    await environmentContext.call(GraphExtract, {});

    expect(environmentContext.clone).toHaveBeenCalledExactlyOnceWith({
      workingDirectory: rootPath,
      processors: null,
      environment: null,
    });
  });

  it('should write the graph and the report', async () => {
    const output = join(rootPath, 'out', 'graph.yaml');
    const report = join(rootPath, 'out', 'report.yaml');

    const actualResult = await context.call(GraphExtract, { output, report });

    const actualGraph = parse(await readFile(output, 'utf-8'));
    expect(actualGraph).toEqual(actualResult.graph);
    const actualReport = parse(await readFile(report, 'utf-8'));
    expect(actualReport).toEqual({
      summary: { nodes: 2, edges: 2, warnings: 2, failures: 3, dangling: 2 },
      rules: actualResult.rules,
      facts: actualResult.facts,
      failures: actualResult.failures,
    });
  });
});
