import type { InputData } from 'quicktype-core';
import { makeJsonSchemaInputData } from '../../code-generation/index.js';
import { ModelParseCodeGeneratorInputs } from '../../definitions/index.js';
import type { ModelMakeGeneratorQuicktypeInputDataForJsonSchema } from './make-generator-quicktype-input-data.js';

export default async function call(
  this: ModelMakeGeneratorQuicktypeInputDataForJsonSchema,
): Promise<InputData> {
  const { files, nestedSchemas, includeFullReferences } =
    await this._context.call(ModelParseCodeGeneratorInputs, {
      configuration: this.configuration,
    });

  return await makeJsonSchemaInputData(files, {
    nestedSchemas,
    includeFullReferences,
  });
}
