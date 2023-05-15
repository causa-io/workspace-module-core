import { ProcessorInstruction } from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  InfrastructurePrepare,
  InfrastructureProcessAndPrepare,
  PrepareResult,
} from '../definitions/index.js';
import { InfrastructureProcessAndPrepareForAll } from './infrastructure-process-and-prepare.js';

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
    expect(prepareMock).toHaveBeenCalledOnceWith(context, {
      print: true,
      output: '🚀',
    });
  });

  it('should run processors and forward the call to InfrastructurePrepare', async () => {
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
      output: '🚀',
    });

    expect(actualResult).toEqual(expectedResult);
    expect(prepareMock).toHaveBeenCalledOnceWith(clonedContext, {
      print: true,
      output: '🚀',
    });
    expect(context.clone).toHaveBeenCalledOnceWith({
      processors: expectedProcessorInstructions,
    });
  });
});
