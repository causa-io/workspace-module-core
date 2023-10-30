import {
  ProcessorInstruction,
  ProcessorResult,
  WorkspaceFunction,
} from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { AllowMissing } from '@causa/workspace/validation';
import { jest } from '@jest/globals';
import { IsBoolean, IsString } from 'class-validator';
import 'jest-extended';
import {
  InfrastructurePrepare,
  InfrastructureProcessAndPrepare,
  InfrastructureProcessor,
  PrepareResult,
} from '../../definitions/index.js';
import { InfrastructureProcessAndPrepareForAll } from './process-and-prepare.js';

abstract class FirstProcessor
  extends WorkspaceFunction<Promise<ProcessorResult>>
  implements InfrastructureProcessor
{
  @IsBoolean()
  @AllowMissing()
  readonly tearDown?: boolean;
}

abstract class SecondProcessor
  extends WorkspaceFunction<Promise<ProcessorResult>>
  implements InfrastructureProcessor
{
  @IsString()
  readonly arg1!: string;

  @IsString()
  readonly arg2!: string;

  @IsBoolean()
  @AllowMissing()
  readonly tearDown?: boolean;
}

describe('InfrastructureProcessAndPrepareForAll', () => {
  it('should not run any processor and forward the call to InfrastructurePrepare', async () => {
    const { context, functionRegistry } = createContext({
      functions: [InfrastructureProcessAndPrepareForAll],
    });
    const expectedResult: PrepareResult = {
      isDeploymentNeeded: true,
      output: '🚀',
    };
    const prepareMock = registerMockFunction(
      functionRegistry,
      InfrastructurePrepare,
      async () => expectedResult,
    );

    const actualResult = await context.call(InfrastructureProcessAndPrepare, {
      print: true,
      output: '🚀',
    });

    expect(actualResult).toEqual(expectedResult);
    expect(prepareMock).toHaveBeenCalledExactlyOnceWith(context, {
      print: true,
      output: '🚀',
    });
  });

  it('should run processors, forward the call to InfrastructurePrepare, and tear down processors', async () => {
    const { context: clonedContext, functionRegistry } = createContext();
    const expectedResult: PrepareResult = {
      isDeploymentNeeded: true,
      output: '🚀',
    };
    const prepareMock = registerMockFunction(
      functionRegistry,
      InfrastructurePrepare,
      async () => expectedResult,
    );
    const firstProcessorMock = registerMockFunction(
      functionRegistry,
      FirstProcessor,
      async () => ({ configuration: {} }),
    );
    const secondProcessorMock = registerMockFunction(
      functionRegistry,
      SecondProcessor,
      async () => ({ configuration: {} }),
    );
    const expectedProcessorInstructions: ProcessorInstruction[] = [
      { name: 'FirstProcessor' },
      { name: 'SecondProcessor', args: { arg1: 'val1', arg2: 'val2' } },
    ];
    const { context } = createContext({
      configuration: {
        workspace: { name: '🧪' },
        infrastructure: { processors: expectedProcessorInstructions },
      },
      functions: [InfrastructureProcessAndPrepareForAll],
    });
    jest.spyOn(context, 'clone').mockResolvedValueOnce(clonedContext);

    const actualResult = await context.call(InfrastructureProcessAndPrepare, {
      print: true,
      destroy: true,
      output: '🚀',
    });

    expect(actualResult).toEqual(expectedResult);
    expect(prepareMock).toHaveBeenCalledExactlyOnceWith(clonedContext, {
      print: true,
      destroy: true,
      output: '🚀',
    });
    expect(context.clone).toHaveBeenCalledExactlyOnceWith({
      processors: expectedProcessorInstructions,
    });
    expect(firstProcessorMock).toHaveBeenCalledExactlyOnceWith(clonedContext, {
      tearDown: true,
    });
    expect(secondProcessorMock).toHaveBeenCalledExactlyOnceWith(clonedContext, {
      arg1: 'val1',
      arg2: 'val2',
      tearDown: true,
    });
  });
});
