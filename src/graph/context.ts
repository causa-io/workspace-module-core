import type { WorkspaceContext } from '@causa/workspace';
import type { GraphOriginSource } from './generated.js';
import { YamlLocator } from './locate.js';

/**
 * Something found during the extraction that does not prevent it, raised by a rule or a fact. For example, a
 * declaration that cannot be turned into a node or an edge.
 */
export type GraphWarning = {
  /**
   * A human-readable description of the issue.
   */
  readonly message: string;

  /**
   * The locations in the workspace the warning relates to.
   */
  readonly sources?: GraphOriginSource[];
};

/**
 * A part of the extraction that failed as a whole: a `GraphListRules` implementation that could not list its
 * rules, or a {@link GraphFact} that could not be computed.
 * The elements that depend on it are missing from the graph.
 */
export type GraphExtractionFailure = {
  /**
   * The name of what failed: the function implementation, or the fact.
   */
  readonly extraction: string;

  /**
   * The message of the error thrown by the extraction.
   */
  readonly message: string;
};

/**
 * What a {@link GraphFact} computes: its value, and the warnings raised while computing it.
 */
export type GraphFactOutput<T> = {
  /**
   * The value of the fact, returned by {@link GraphContext.get}.
   */
  readonly value: T;

  /**
   * The warnings raised while computing the fact, e.g. about inputs it cannot interpret.
   */
  readonly warnings?: GraphWarning[];
};

/**
 * A fact computed during the extraction, and the warnings it raised.
 */
export type GraphFactReport = {
  /**
   * The name of the fact, i.e. the name of its class.
   */
  readonly name: string;

  /**
   * The warnings raised while computing the fact.
   */
  readonly warnings: GraphWarning[];
};

/**
 * A piece of information about the workspace, computed once per extraction and shared by all the rules needing it,
 * using {@link GraphContext.get}.
 */
export abstract class GraphFact<T> {
  /**
   * Computes the fact.
   *
   * @param graph The context of the extraction, from which other facts can be read.
   * @returns The value of the fact, and the warnings raised while computing it.
   */
  abstract compute(
    graph: GraphContext,
  ): GraphFactOutput<T> | Promise<GraphFactOutput<T>>;
}

/**
 * The class of a {@link GraphFact}, which identifies the fact.
 */
export type GraphFactType<T> = new () => GraphFact<T>;

/**
 * Thrown by {@link GraphContext.get} when a fact cannot be computed.
 * The failure is recorded once in {@link GraphContext.failures}, such that the rules depending on the fact do not need
 * to report it.
 */
export class GraphFactError extends Error {
  constructor(
    readonly fact: string,
    readonly cause: unknown,
  ) {
    super(`The fact '${fact}' could not be computed.`, { cause });
  }
}

/**
 * The context of a single graph extraction, passed to all the rules.
 * It exposes the workspace, and computes the facts rules need once, on first use.
 */
export class GraphContext {
  /**
   * The locator used to build origin sources.
   */
  readonly locator: YamlLocator;

  /**
   * The facts that could not be computed.
   */
  readonly failures: GraphExtractionFailure[] = [];

  /**
   * The reports of the facts computed so far, in the order in which they were computed. Facts whose value is passed
   * to the constructor are not computed, and not reported.
   */
  private readonly reports: GraphFactReport[] = [];

  /**
   * The values of the facts that have been requested, keyed by their class.
   */
  private readonly values = new Map<GraphFactType<unknown>, Promise<unknown>>();

  /**
   * Creates a new {@link GraphContext}.
   *
   * @param context The context for the workspace root.
   * @param facts Values for some facts, which are then not computed. This is mostly useful for tests.
   */
  constructor(
    readonly context: WorkspaceContext,
    facts: Iterable<[GraphFactType<unknown>, unknown]> = [],
  ) {
    this.locator = new YamlLocator(context.rootPath);
    for (const [fact, value] of facts) {
      this.values.set(fact, Promise.resolve(value));
    }
  }

  /**
   * Returns the value of a fact, computing it on the first call.
   * If the fact cannot be computed, the failure is recorded in {@link GraphContext.failures}, and a
   * {@link GraphFactError} is thrown to all callers.
   *
   * @param fact The class of the fact.
   * @returns The value of the fact.
   */
  get<T>(fact: GraphFactType<T>): Promise<T> {
    let value = this.values.get(fact);
    if (!value) {
      value = this.compute(fact);
      this.values.set(fact, value);
    }

    return value as Promise<T>;
  }

  /**
   * The reports of the facts computed so far, sorted by name.
   */
  get facts(): GraphFactReport[] {
    return [...this.reports].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Computes a fact, recording its warnings, or the failure if it cannot be computed.
   * A fact failing because another fact failed is not recorded again.
   */
  private async compute<T>(fact: GraphFactType<T>): Promise<T> {
    try {
      const { value, warnings } = await new fact().compute(this);
      this.reports.push({ name: fact.name, warnings: warnings ?? [] });
      return value;
    } catch (error: any) {
      if (error instanceof GraphFactError) {
        throw error;
      }

      this.context.logger.error(
        `❌ Graph fact '${fact.name}' could not be computed: ${error?.stack ?? error}`,
      );
      this.failures.push({
        extraction: fact.name,
        message: error?.message ?? `${error}`,
      });
      throw new GraphFactError(fact.name, error);
    }
  }
}
