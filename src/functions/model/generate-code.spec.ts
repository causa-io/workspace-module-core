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
      async (_, args) => [`1️⃣: ${JSON.stringify(args.configuration)}`],
      { supports: (_, { generator }) => generator === 'gen1' },
    );
    registerMockFunction(
      functionRegistry,
      ModelRunCodeGenerator,
      async (_, args) => [`2️⃣: ${JSON.stringify(args.configuration)}`],
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

  it('should do nothing if there is no configured code generator', async () => {
    initContext({});

    const actualFiles = await context.call(ModelGenerateCode, {});

    expect(actualFiles).toBeEmpty();
  });

  it('should run all code generators and return the generated files', async () => {
    initContext(configuration);

    const actualFiles = await context.call(ModelGenerateCode, {});

    expect(actualFiles).toIncludeSameMembers([
      '1️⃣: {"val1":"🤖"}',
      '2️⃣: {"val2":"🔧"}',
    ]);
  });

  it('should log a warning if a code generator cannot be found', async () => {
    ({ context, functionRegistry } = createContext({
      functions: [ModelGenerateCodeForAll],
      configuration,
    }));
    gen1Mock = registerMockFunction(
      functionRegistry,
      ModelRunCodeGenerator,
      async (_, args) => [`1️⃣: ${JSON.stringify(args.configuration)}`],
      { supports: (_, { generator }) => generator === 'gen1' },
    );
    jest.spyOn(context.logger, 'warn');

    const actualFiles = await context.call(ModelGenerateCode, {});

    expect(actualFiles).toIncludeSameMembers(['1️⃣: {"val1":"🤖"}']);
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
