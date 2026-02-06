import { callDeferred, type WorkspaceContext } from '@causa/workspace';
import type { InputData } from 'quicktype-core';
import type { ModelConfiguration } from '../../configurations/index.js';
import { ModelMakeGeneratorQuicktypeInputData } from '../../definitions/index.js';

/**
 * Implements the {@link ModelMakeGeneratorQuicktypeInputData} function for JSONSchema models.
 * This creates `quicktype`'s {@link InputData} from JSONSchema files found through the standard code generator
 * configuration.
 */
export class ModelMakeGeneratorQuicktypeInputDataForJsonSchema extends ModelMakeGeneratorQuicktypeInputData {
  async _call(context: WorkspaceContext): Promise<InputData> {
    return await callDeferred(this, context, import.meta.url);
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.asConfiguration<ModelConfiguration>().get('model.schema') ===
      'jsonschema'
    );
  }
}
