import type { WorkspaceContext } from '@causa/workspace';
import type { InputData } from 'quicktype-core';
import { makeJsonSchemaInputData } from '../../code-generation/index.js';
import type { ModelConfiguration } from '../../configurations/index.js';
import {
  ModelMakeGeneratorQuicktypeInputData,
  ModelParseCodeGeneratorInputs,
} from '../../definitions/index.js';

/**
 * Implements the {@link ModelMakeGeneratorQuicktypeInputData} function for JSONSchema models.
 * This creates `quicktype`'s {@link InputData} from JSONSchema files found through the standard code generator
 * configuration.
 */
export class ModelMakeGeneratorQuicktypeInputDataForJsonSchema extends ModelMakeGeneratorQuicktypeInputData {
  async _call(context: WorkspaceContext): Promise<InputData> {
    const { files, nestedSchemas, includeFullReferences } = await context.call(
      ModelParseCodeGeneratorInputs,
      { configuration: this.configuration },
    );

    return await makeJsonSchemaInputData(files, {
      nestedSchemas,
      includeFullReferences,
    });
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.asConfiguration<ModelConfiguration>().get('model.schema') ===
      'jsonschema'
    );
  }
}
