import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { pino } from 'pino';
import {
  GraphContext,
  GraphExtractionFact,
  GraphFactError,
  type GraphFactOutput,
} from './context.js';

class ValueFact extends GraphExtractionFact<string> {
  async compute(): Promise<GraphFactOutput<string>> {
    return { value: '🎉' };
  }
}

class BaseFact extends GraphExtractionFact<number> {
  compute(): GraphFactOutput<number> {
    return {
      value: 1,
      warnings: [{ message: '⚠️', sources: [{ path: 'causa.yaml' }] }],
    };
  }
}

class DerivedFact extends GraphExtractionFact<number> {
  async compute(graph: GraphContext): Promise<GraphFactOutput<number>> {
    return { value: (await graph.get(BaseFact)) + 1 };
  }
}

class FailingFact extends GraphExtractionFact<number> {
  compute(): GraphFactOutput<number> {
    throw new Error('💥');
  }
}

class DependentFact extends GraphExtractionFact<number> {
  async compute(graph: GraphContext): Promise<GraphFactOutput<number>> {
    return { value: (await graph.get(FailingFact)) + 1 };
  }
}

describe('GraphContext', () => {
  let graph: GraphContext;

  beforeEach(() => {
    const { context } = createContext({
      rootPath: '/workspace',
      configuration: { workspace: { name: '📦' } },
      logger: pino({ level: 'silent' }),
    });
    graph = new GraphContext(context);
  });

  it('should expose the locator', () => {
    expect(graph.locator.rootPath).toEqual('/workspace');
  });

  it('should compute a fact once', async () => {
    jest.spyOn(ValueFact.prototype, 'compute');

    const actualValues = await Promise.all([
      graph.get(ValueFact),
      graph.get(ValueFact),
    ]);

    expect(actualValues).toEqual(['🎉', '🎉']);
    expect(ValueFact.prototype.compute).toHaveBeenCalledExactlyOnceWith(graph);
  });

  it('should compute facts depending on other facts, and report their warnings', async () => {
    const actualValue = await graph.get(DerivedFact);

    expect(actualValue).toEqual(2);
    expect(graph.facts).toEqual([
      {
        name: 'BaseFact',
        warnings: [{ message: '⚠️', sources: [{ path: 'causa.yaml' }] }],
      },
      { name: 'DerivedFact', warnings: [] },
    ]);
  });

  it('should use the values of seeded facts, without reporting them', async () => {
    graph = new GraphContext(graph.context, [[FailingFact, 42]]);

    const actualValue = await graph.get(FailingFact);

    expect(actualValue).toEqual(42);
    expect(graph.facts).toEqual([]);
  });

  it('should record a failed fact once, including when other facts depend on it', async () => {
    const actualFailing = graph.get(FailingFact);
    const actualDependent = graph.get(DependentFact);

    await expect(actualFailing).rejects.toThrow(GraphFactError);
    await expect(actualDependent).rejects.toThrow(GraphFactError);
    expect(graph.failures).toEqual([{ name: 'FailingFact', message: '💥' }]);
    expect(graph.facts).toEqual([]);
  });
});
