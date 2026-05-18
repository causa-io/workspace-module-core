import { readFile } from 'node:fs/promises';
import type { ModelConfiguration } from '../../configurations/index.js';
import {
  ModelSchemaExtractDatabase,
  ModelSchemaParse,
  type LoadSchemasResult,
} from '../../definitions/index.js';
import { loadSchemas } from '../../jsonschema/index.js';

/**
 * Implements {@link ModelSchemaParse} for JSON Schema models. Loads and parses every file reachable from the input
 * paths, then asks every {@link ModelSchemaExtractDatabase} implementation to derive database bindings from each
 * parsed object schema.
 */
export class ModelSchemaParseForJsonSchema extends ModelSchemaParse {
  async _call(): Promise<LoadSchemasResult> {
    const result = await loadSchemas(this.paths, {
      fileReader:
        this.fileReader ?? ((path) => readFile(path, { encoding: 'utf-8' })),
    });

    for (const schema of Object.values(result.schemas)) {
      if (schema.kind !== 'object') {
        continue;
      }

      schema.databases = this._context
        .callAll(ModelSchemaExtractDatabase, { schema })
        .filter((db) => db);
    }

    return result;
  }

  _supports(): boolean {
    return (
      this._context
        .asConfiguration<ModelConfiguration>()
        .get('model.schema') === 'jsonschema'
    );
  }
}
