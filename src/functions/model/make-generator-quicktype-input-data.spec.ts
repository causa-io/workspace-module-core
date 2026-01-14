import type { WorkspaceContext } from '@causa/workspace';
import type { FunctionRegistry } from '@causa/workspace/function-registry';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import {
  createContext,
  registerMockFunction,
  type WorkspaceFunctionCallMock,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import type { InputData } from 'quicktype-core';
import type { makeJsonSchemaInputData as MakeJsonSchemaInputDataType } from '../../code-generation/index.js';
import {
  ModelMakeGeneratorQuicktypeInputData,
  ModelParseCodeGeneratorInputs,
  type CodeGeneratorInputs,
} from '../../definitions/index.js';
import { ModelMakeGeneratorQuicktypeInputDataForJsonSchema } from './make-generator-quicktype-input-data.js';

jest.unstable_mockModule('../../code-generation/index.js', () => ({
  makeJsonSchemaInputData: jest.fn(),
}));

describe('ModelMakeGeneratorQuicktypeInputDataForJsonSchema', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let parseInputsMock: WorkspaceFunctionCallMock<ModelParseCodeGeneratorInputs>;
  let mockInputData: InputData;
  let makeJsonSchemaInputData: jest.SpiedFunction<
    typeof MakeJsonSchemaInputDataType
  >;
  let ModelMakeGeneratorQuicktypeInputDataForJsonSchemaClass: typeof ModelMakeGeneratorQuicktypeInputDataForJsonSchema;

  beforeAll(async () => {
    ({ makeJsonSchemaInputData } =
      (await import('../../code-generation/index.js')) as any);
    ({
      ModelMakeGeneratorQuicktypeInputDataForJsonSchema:
        ModelMakeGeneratorQuicktypeInputDataForJsonSchemaClass,
    } = await import('./make-generator-quicktype-input-data.js'));

    mockInputData = {} as InputData;
    makeJsonSchemaInputData.mockResolvedValue(mockInputData);
  });

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      functions: [ModelMakeGeneratorQuicktypeInputDataForJsonSchemaClass],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
    parseInputsMock = registerMockFunction(
      functionRegistry,
      ModelParseCodeGeneratorInputs,
      async () => ({
        includeEvents: false,
        globs: [],
        files: [],
        nestedSchemas: undefined,
        includeFullReferences: undefined,
      }),
    );
  });

  it('should pass through configuration options to makeJsonSchemaInputData', async () => {
    const configuration = { someOption: 'test' };
    const mockInputs: CodeGeneratorInputs = {
      includeEvents: true,
      globs: ['*.json'],
      files: ['/path/to/schema.json'],
      nestedSchemas: ['definitions', 'properties'],
      includeFullReferences: true,
    };
    parseInputsMock.mockResolvedValueOnce(mockInputs);

    const result = await context.call(ModelMakeGeneratorQuicktypeInputData, {
      configuration,
    });

    expect(result).toBe(mockInputData);
    expect(parseInputsMock).toHaveBeenCalledWith(context, { configuration });
    expect(makeJsonSchemaInputData).toHaveBeenCalledWith(mockInputs.files, {
      nestedSchemas: mockInputs.nestedSchemas,
      includeFullReferences: mockInputs.includeFullReferences,
    });
  });

  it('should throw NoImplementationFoundError when model.schema is not jsonschema', () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'avro' as any },
      },
      functions: [ModelMakeGeneratorQuicktypeInputDataForJsonSchemaClass],
    });

    expect(() =>
      context.call(ModelMakeGeneratorQuicktypeInputData, {
        configuration: {},
      }),
    ).toThrow(NoImplementationFoundError);
  });
});
