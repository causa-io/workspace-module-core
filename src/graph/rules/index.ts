import type { GraphRule } from '../../definitions/index.js';
import { domainFromConfiguration } from './domain-from-configuration.js';

/**
 * The rules extracting core Causa concepts: domains, projects, the model, and the relations declared by service
 * containers.
 */
export const CORE_GRAPH_RULES: readonly GraphRule[] = [
  domainFromConfiguration,
];
