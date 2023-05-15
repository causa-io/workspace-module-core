import { ProcessorInstruction, WorkspaceFunction } from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { AllowMissing } from '@causa/workspace/validation';
import { jest } from '@jest/globals';
import { IsBoolean, IsString } from 'class-validator';
import 'jest-extended';
import {
  InfrastructureDeploy,
  InfrastructureProcessAndDeploy,
  InfrastructureProcessor,
} from '../definitions/index.js';
import { InfrastructureProcessAndDeployForAll } from './infrastructure-process-and-deploy.js';

abstract class FirstProcessor
  extends WorkspaceFunction<{}>
  implements InfrastructureProcessor
{
  @IsBoolean()
  @AllowMissing()
  readonly tearDown?: boolean;
}

abstract class SecondProcessor
  extends WorkspaceFunction<{}>
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

describe('InfrastructureProcessAndDeployForAll', () => {
  it('should not run any processor and forward the call to InfrastructureDeploy', async () => {
    const { context, functionRegistry } = createContext({
      functions: [InfrastructureProcessAndDeployForAll],
    });
    const deployMock = registerMockFunction(
      functionRegistry,
      InfrastructureDeploy,
      async () => {},
    );

    await context.call(InfrastructureProcessAndDeploy, {
      deployment: '🚀',
    });

    expect(deployMock).toHaveBeenCalledOnceWith(context, {
      deployment: '🚀',
    });
  });

  it('should run processors, forward the call to InfrastructureDeploy, and tear down processors', async () => {
    const { context: clonedContext, functionRegistry } = createContext();
    const deployMock = registerMockFunction(
      functionRegistry,
      InfrastructureDeploy,
      async () => {},
    );
    const firstProcessorMock = registerMockFunction(
      functionRegistry,
      FirstProcessor,
      async () => {},
    );
    const secondProcessorMock = registerMockFunction(
      functionRegistry,
      SecondProcessor,
      async () => {},
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
      functions: [InfrastructureProcessAndDeployForAll],
    });
    jest.spyOn(context, 'clone').mockResolvedValueOnce(clonedContext);

    await context.call(InfrastructureProcessAndDeploy, {
      deployment: '🚀',
    });

    expect(deployMock).toHaveBeenCalledOnceWith(clonedContext, {
      deployment: '🚀',
    });
    expect(context.clone).toHaveBeenCalledOnceWith({
      processors: expectedProcessorInstructions,
    });
    expect(firstProcessorMock).toHaveBeenCalledOnceWith(clonedContext, {
      tearDown: true,
    });
    expect(secondProcessorMock).toHaveBeenCalledOnceWith(clonedContext, {
      arg1: 'val1',
      arg2: 'val2',
      tearDown: true,
    });
  });
});
