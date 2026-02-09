import { WorkspaceFunction } from '@causa/workspace';

/**
 * Lists absolute paths to configuration JSON Schema files provided by a module.
 * Each module should implement this function to return the paths to its own configuration schemas.
 * All implementations are called during workspace initialization to produce a combined schema.
 */
export abstract class CausaListConfigurationSchemas extends WorkspaceFunction<
  Promise<string[]>
> {}
