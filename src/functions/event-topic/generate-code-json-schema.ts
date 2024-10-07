import { WorkspaceContext } from '@causa/workspace';
import {
  FetchingJSONSchemaStore,
  InputData,
  JSONSchemaInput,
  type JSONSchemaSourceData,
  quicktype,
} from 'quicktype-core';
import { causaJsonSchemaAttributeProducer } from '../../code-generation/index.js';
import type { EventsConfiguration } from '../../configurations/index.js';
import {
  EventTopicGenerateCode,
  EventTopicMakeCodeGenerationTargetLanguage,
} from '../../definitions/index.js';

/**
 * Implements the {@link EventTopicGenerateCode} function for event schemas defined using JSONSchema.
 * This implementation relies on the `quicktype-core` package, which supports many output languages.
 * Language-specific Causa modules should implement the {@link EventTopicMakeCodeGenerationTargetLanguage} function. Its
 * return value is used as the language passed to quicktype.
 */
export class EventTopicGenerateCodeForJsonSchema extends EventTopicGenerateCode {
  /**
   * Constructs the {@link InputData} quicktype object from the event {@link EventTopicGenerateCode.definitions},
   * assuming that they are JSONSchema definitions.
   *
   * @returns The {@link InputData} object that is passed to quicktype.
   */
  private async makeJsonSchemaInputData(): Promise<InputData> {
    const input = new JSONSchemaInput(new FetchingJSONSchemaStore(), [
      causaJsonSchemaAttributeProducer,
    ]);

    const sources: JSONSchemaSourceData[] = this.definitions.map(
      (definition) => ({
        // There is an inconsistent behavior in naming when passing a single schema file to quicktype.
        // Setting the name as `undefined` ensures the `title` JSONSchema attribute is used as the class name for the
        // top-level type in the schema.
        name: undefined as any,
        uris: [definition.schemaFilePath],
      }),
    );

    for (const source of sources) {
      await input.addSource(source);
    }

    const inputData = new InputData();
    inputData.addInput(input);

    return inputData;
  }

  async _call(context: WorkspaceContext): Promise<void> {
    context.getProjectPathOrThrow();

    const inputData = await this.makeJsonSchemaInputData();

    const lang = await context.call(
      EventTopicMakeCodeGenerationTargetLanguage,
      {},
    );

    const result = await quicktype({ inputData, lang });
    const outputLines = result.lines.join('\n');

    context.logger.info('🔨 Writing generated code to output file.');
    await lang.writeFile(outputLines);
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.asConfiguration<EventsConfiguration>().get('events.format') ===
      'json'
    );
  }
}
