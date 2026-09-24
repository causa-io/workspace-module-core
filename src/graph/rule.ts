import type {
  GraphOriginKind,
  GraphRule,
  GraphRuleEdge,
  GraphRuleNode,
  GraphRuleOutput,
  GraphWarning,
} from '../definitions/index.js';
import { GraphFactError, type GraphContext } from './context.js';

/**
 * The result of running a single rule: what it emitted, and the warnings it raised.
 * Nodes and edges are not deduplicated, and may reference nodes emitted by other rules.
 */
export type GraphRuleResult = {
  /**
   * The name of the rule, as it appears in origins.
   */
  readonly name: string;

  /**
   * The kind of origin the rule emits.
   */
  readonly kind: GraphOriginKind;

  /**
   * What the rule reads and emits.
   */
  readonly description: string;

  /**
   * The nodes the rule emitted.
   */
  readonly nodes: GraphRuleNode[];

  /**
   * The edges the rule emitted.
   */
  readonly edges: GraphRuleEdge[];

  /**
   * The warnings the rule raised.
   */
  readonly warnings: GraphWarning[];
};

/**
 * Runs the given rules against the same context.
 * A rule that throws does not prevent the others from running: the error is turned into a warning of the rule.
 * A rule failing because a fact could not be computed does not report it: the failure is recorded once by the context.
 *
 * @param rules The rules to run.
 * @param graph The context of the extraction.
 * @returns The results of the rules.
 */
export async function runGraphRules(
  rules: readonly GraphRule[],
  graph: GraphContext,
): Promise<GraphRuleResult[]> {
  return await Promise.all(rules.map((r) => runGraphRule(r, graph)));
}

/**
 * Runs a single rule, turning an error into a warning of the rule.
 *
 * @param rule The rule to run.
 * @param graph The context of the extraction.
 * @returns The result of the rule.
 */
async function runGraphRule(
  rule: GraphRule,
  graph: GraphContext,
): Promise<GraphRuleResult> {
  const { name, kind, description } = rule;

  let output: GraphRuleOutput = {};
  try {
    output = await rule.run(graph);
  } catch (error: any) {
    if (!(error instanceof GraphFactError)) {
      graph.context.logger.error(
        `❌ Graph rule '${name}' failed: ${error.stack ?? error}`,
      );
      output = {
        warnings: [{ message: `The rule failed: ${error.message ?? error}` }],
      };
    }
  }

  return {
    name,
    kind,
    description,
    nodes: output.nodes ?? [],
    edges: output.edges ?? [],
    warnings: output.warnings ?? [],
  };
}
