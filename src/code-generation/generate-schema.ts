import {
  FetchingJSONSchemaStore,
  InputData,
  JSONSchemaInput,
  quicktype,
  type JSONSchemaSourceData,
} from 'quicktype-core';
import { causaJsonSchemaAttributeProducer } from './jsonschema-attribute-producer.js';
import type { TargetLanguageWithWriter } from './target-language-with-writer.js';

/**
 * Default fragments that will be searched in each schema file to generate schemas other than the top-level one.
 */
const DEFAULT_NESTED_SCHEMAS_FRAGMENTS = ['#/$defs/', '#/definitions/'];

/**
 * Constructs an {@link InputData} object that lists JSONSchema files, which can be used by
 * {@link generateCodeForSchemas}.
 *
 * @param files The schema files from which to generate code.
 * @param options Options for the input data.
 * @returns The {@link InputData} object that can be passed to {@link generateCodeForSchemas}.
 */
export async function makeJsonSchemaInputData(
  files: string[],
  options: {
    /**
     * Fragments that will be added to each schema file to generate schemas other than the top-level one.
     * This is only needed for the nested schemas that are not referenced by top-level schemas.
     * To include all schemas under a given JSON path, end the fragment with a `/`, e.g. `#/$defs/`.
     * Defaults to `#/$defs/` and `#/definitions/`.
     */
    nestedSchemasFragments?: string[];
  } = {},
): Promise<InputData> {
  const nestedSchemasFragments =
    options.nestedSchemasFragments ?? DEFAULT_NESTED_SCHEMAS_FRAGMENTS;

  const input = new JSONSchemaInput(new FetchingJSONSchemaStore(), [
    causaJsonSchemaAttributeProducer,
  ]);

  const sources: JSONSchemaSourceData[] = files.map((file) => ({
    // There is an inconsistent behavior in naming when passing a single schema file to quicktype.
    // Setting the name as `undefined` ensures the `title` JSONSchema attribute is used as the class name for the
    // top-level type in the schema.
    name: undefined as any,
    uris: [
      ...nestedSchemasFragments.map((fragment) => `${file}${fragment}`),
      file,
    ],
  }));

  for (const source of sources) {
    await input.addSource(source);
  }

  const inputData = new InputData();
  inputData.addInput(input);

  return inputData;
}

/**
 * Generates the code for the given schemas using the provided target language, and writes it to the configured file.
 *
 * @param lang The target language used to generate code.
 * @param inputData The {@link InputData} referencing the schemas.
 */
export async function generateCodeForSchemas(
  lang: TargetLanguageWithWriter,
  inputData: InputData,
): Promise<void> {
  const result = await quicktype({ inputData, lang });
  const outputLines = result.lines.join('\n');
  await lang.writeFile(outputLines);
}
