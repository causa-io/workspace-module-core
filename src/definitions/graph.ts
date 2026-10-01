import {
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsString } from 'class-validator';
import { stringify } from 'yaml';
import type {
  GraphContext,
  GraphExtractionFailure,
  GraphFactReport,
  GraphWarning,
} from '../graph/context.js';
import type {
  Graph,
  GraphEdge,
  GraphNode,
  GraphNodes,
  GraphOriginKind,
  GraphOriginSource,
} from '../graph/generated.js';

export * from '../graph/generated.js';
export type { GraphWarning } from '../graph/context.js';

/**
 * The `graph` parent command, grouping all commands related to the architecture graph of the workspace.
 */
export const graphCommandDefinition: ParentCliCommandDefinition = {
  name: 'graph',
  description: 'Extracts the architecture graph of the workspace.',
};

/**
 * A layer of the graph.
 */
export type GraphLayer = keyof GraphNodes;

/**
 * Describes a rule that contributed to the graph, and what it emitted.
 */
export type GraphRuleReport = {
  /**
   * The name of the rule, as it appears in origins.
   */
  readonly name: string;

  /**
   * The kind of origin the rule emits.
   */
  readonly kind: GraphOriginKind;

  /**
   * What the rule reads and emits, for anyone reading an origin that names it.
   */
  readonly description: string;

  /**
   * The number of distinct nodes the rule emitted.
   */
  readonly nodes: number;

  /**
   * The number of distinct edges the rule emitted.
   */
  readonly edges: number;

  /**
   * The warnings the rule raised.
   */
  readonly warnings: GraphWarning[];

  /**
   * The references held by the elements the rule emitted, to nodes that no rule emitted.
   */
  readonly dangling: GraphDanglingReference[];
};

/**
 * A node, as returned by a rule. The origin is built from the rule and the given sources.
 */
export type GraphRuleNode = Omit<GraphNode, 'origin'> & {
  /**
   * The layer of the node.
   */
  readonly layer: GraphLayer;

  /**
   * The type of the node.
   */
  readonly type: string;

  /**
   * The locator of the node within its type.
   */
  readonly locator: string;

  /**
   * The locations in the workspace the node is extracted from.
   */
  readonly sources: GraphOriginSource[];
};

/**
 * An edge, as returned by a rule. The origin is built from the rule and the given sources.
 */
export type GraphRuleEdge = Omit<GraphEdge, 'origin'> & {
  /**
   * The type of the edge.
   */
  readonly type: string;

  /**
   * The locations in the workspace the edge is extracted from.
   */
  readonly sources: GraphOriginSource[];
};

/**
 * What a rule returns: the nodes and edges it extracted, and the warnings it raised.
 */
export type GraphRuleOutput = {
  /**
   * The nodes the rule extracted.
   */
  readonly nodes?: GraphRuleNode[];

  /**
   * The edges the rule extracted.
   */
  readonly edges?: GraphRuleEdge[];

  /**
   * Things the workspace declares that the rule could not turn into a node or an edge.
   */
  readonly warnings?: GraphWarning[];
};

/**
 * A single extraction rule.
 * Every node and edge carries the name of the rule that produced it in its origin.
 * Rules read the workspace through the {@link GraphContext}, and return elements. They reference nodes returned by
 * other rules using their IDs, without checking that they exist.
 */
export type GraphRule = {
  /**
   * The name of the rule, as it appears in origins.
   */
  readonly name: string;

  /**
   * How the rule extracts elements from its sources.
   */
  readonly kind: GraphOriginKind;

  /**
   * What the rule reads and what it emits.
   */
  readonly description: string;

  /**
   * Runs the rule.
   *
   * @param graph The context of the extraction, from which the rule reads the workspace and the facts it needs.
   * @returns The elements the rule extracted, and the warnings it raised.
   */
  run(graph: GraphContext): GraphRuleOutput | Promise<GraphRuleOutput>;
};

/**
 * The result of {@link GraphExtract}: the merged graph, and the report of how it was built.
 */
export type GraphExtractResult = {
  /**
   * The architecture graph of the workspace.
   */
  readonly graph: Graph;

  /**
   * The reports of the rules that ran.
   */
  readonly rules: GraphRuleReport[];

  /**
   * The reports of the facts that were computed.
   */
  readonly facts: GraphFactReport[];

  /**
   * The extractions that failed, whose elements are missing from the graph.
   */
  readonly failures: GraphExtractionFailure[];
};

/**
 * A reference to a node that does not exist in the graph.
 */
export type GraphDanglingReference = {
  /**
   * The ID of the missing node.
   */
  readonly id: string;
} & (
  | {
      /**
       * The reference is the `parent` of a node.
       */
      readonly field: 'parent';

      /**
       * The ID of the node whose parent is missing.
       */
      readonly node: string;
    }
  | {
      /**
       * The end of the edge holding the reference.
       */
      readonly field: 'from' | 'to';

      /**
       * The edge holding the reference.
       */
      readonly edge: {
        /**
         * The type of the edge holding the reference.
         */
        readonly type: string;
      } & Pick<GraphEdge, 'from' | 'to'>;
    }
);

/**
 * Extracts the architecture graph of the workspace, by running the rules returned by all the {@link GraphListRules}
 * implementations.
 */
@CliCommand({
  parent: graphCommandDefinition,
  name: 'extract',
  description: `Extracts the architecture graph of the workspace.
The graph is built from the workspace configuration, model schemas, and infrastructure code, by the rules each module contributes.
It is written as YAML to the output file, or to the standard output if no file is specified.`,
  summary: 'Extracts the architecture graph of the workspace.',
  outputFn: ({ graph }, { output }) => {
    if (!output) {
      console.log(
        stringify(graph, { lineWidth: 0, aliasDuplicateObjects: false }),
      );
    }
  },
})
export abstract class GraphExtract extends WorkspaceFunction<
  Promise<GraphExtractResult>
> {
  /**
   * The file to which the graph should be written, as YAML.
   */
  @CliOption({
    flags: '-o, --output <output>',
    description:
      'The file to which the graph should be written. Defaults to the standard output.',
  })
  @IsString()
  @AllowMissing()
  readonly output?: string;

  /**
   * The file to which the report (rules and their warnings, failures, and dangling references) should be written, as
   * YAML.
   */
  @CliOption({
    flags: '--report <report>',
    description:
      'The file to which the report of rules and their warnings, failures, and dangling references should be written.',
  })
  @IsString()
  @AllowMissing()
  readonly report?: string;
}

/**
 * Lists the rules extracting the architecture graph.
 * Each module implements this function once, returning the rules for what it knows about.
 * Rules are run by {@link GraphExtract}, which passes them a single {@link GraphContext}.
 */
export abstract class GraphListRules extends WorkspaceFunction<GraphRule[]> {}
