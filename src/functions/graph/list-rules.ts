import { GraphListRules, type GraphRule } from '../../definitions/index.js';
import { CORE_GRAPH_RULES } from '../../graph/index.js';

/**
 * Implements {@link GraphListRules} for core Causa concepts: domains, projects, API operations, triggers, topics,
 * entities and their states, and the relations service containers declare between them.
 */
export class GraphListRulesForCore extends GraphListRules {
  _call(): GraphRule[] {
    return [...CORE_GRAPH_RULES];
  }

  _supports(): boolean {
    return true;
  }
}
