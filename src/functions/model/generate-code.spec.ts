import type { WorkspaceContext } from '@causa/workspace';
import type { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  createContext,
  registerMockFunction,
  type WorkspaceFunctionCallMock,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import type { ModelConfiguration } from '../../configurations/model.js';
import {
  ModelGenerateCode,
  ModelRunCodeGenerator,
} from '../../definitions/model.js';
import { ModelGenerateCodeForAll } from './generate-code.js';

describe('ModelGenerateCodeForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let gen1Mock: WorkspaceFunctionCallMock<ModelRunCodeGenerator>;

  function initContext(configuration: Record<string, any>) {
    ({ context, functionRegistry } = createContext({
      functions: [ModelGenerateCodeForAll],
      configuration,
    }));
    gen1Mock = registerMockFunction(
      functionRegistry,
      ModelRunCodeGenerator,
      async (_, args) => ({
        'schema1.json': {
          name: 'Schema1',
          file: `gen1-${JSON.stringify(args.configuration)}.ts`,
        },
      }),
      { supports: (_, { generator }) => generator === 'gen1' },
    );
    registerMockFunction(
      functionRegistry,
      ModelRunCodeGenerator,
      async (_, args) => ({
        'schema2.json': {
          name: 'Schema2',
          file: `gen2-${JSON.stringify(args.configuration)}.ts`,
        },
      }),
      { supports: (_, { generator }) => generator === 'gen2' },
    );
  }

  const configuration: ModelConfiguration = {
    model: {
      codeGenerators: [
        { generator: 'gen1', val1: '🤖' } as any,
        { generator: 'gen2', val2: '🔧' } as any,
      ],
    },
  };

  it('should return an empty output if there is no configured code generator', async () => {
    initContext({});

    const actualOutput = await context.call(ModelGenerateCode, {});

    expect(actualOutput).toEqual({});
  });

  it('should run all code generators and return the generated schemas', async () => {
    initContext(configuration);

    const actualOutput = await context.call(ModelGenerateCode, {});

    expect(actualOutput).toEqual({
      gen1: {
        'schema1.json': { name: 'Schema1', file: 'gen1-{"val1":"🤖"}.ts' },
      },
      gen2: {
        'schema2.json': { name: 'Schema2', file: 'gen2-{"val2":"🔧"}.ts' },
      },
    });
  });

  it('should log a warning if a code generator cannot be found', async () => {
    ({ context, functionRegistry } = createContext({
      functions: [ModelGenerateCodeForAll],
      configuration,
    }));
    gen1Mock = registerMockFunction(
      functionRegistry,
      ModelRunCodeGenerator,
      async (_, args) => ({
        'schema1.json': {
          name: 'Schema1',
          file: `gen1-${JSON.stringify(args.configuration)}.ts`,
        },
      }),
      { supports: (_, { generator }) => generator === 'gen1' },
    );
    jest.spyOn(context.logger, 'warn');

    const actualOutput = await context.call(ModelGenerateCode, {});

    expect(actualOutput).toEqual({
      gen1: {
        'schema1.json': { name: 'Schema1', file: 'gen1-{"val1":"🤖"}.ts' },
      },
    });
    expect(context.logger.warn).toHaveBeenCalledWith(
      `The following generators were not found or do not match the current project configuration: 'gen2'.`,
    );
  });

  it('should throw an error if all code generators fail to be found', async () => {
    ({ context, functionRegistry } = createContext({
      functions: [ModelGenerateCodeForAll],
      configuration,
    }));

    const actualPromise = context.call(ModelGenerateCode, {});

    await expect(actualPromise).rejects.toThrow(
      `All referenced generators could not be found or do not match the current project configuration: 'gen1', 'gen2'.`,
    );
  });

  it('should throw an error if a code generator fails', async () => {
    initContext(configuration);
    gen1Mock.mockRejectedValueOnce(new Error('😵'));

    const actualPromise = context.call(ModelGenerateCode, {});

    await expect(actualPromise).rejects.toThrow('😵');
  });
});
