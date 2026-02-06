import type { WorkspaceContext } from '@causa/workspace';
import type { InputData } from 'quicktype-core';
import { makeJsonSchemaInputData } from '../../code-generation/index.js';
import { ModelParseCodeGeneratorInputs } from '../../definitions/index.js';
import type { ModelMakeGeneratorQuicktypeInputDataForJsonSchema } from './make-generator-quicktype-input-data.js';

export default async function call(
  this: ModelMakeGeneratorQuicktypeInputDataForJsonSchema,
  context: WorkspaceContext,
): Promise<InputData> {
  const { files, nestedSchemas, includeFullReferences } = await context.call(
    ModelParseCodeGeneratorInputs,
    { configuration: this.configuration },
  );

  return await makeJsonSchemaInputData(files, {
    nestedSchemas,
    includeFullReferences,
  });
}
