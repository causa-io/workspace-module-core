import { ProcessorInstruction } from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  InfrastructureDeploy,
  InfrastructureProcessAndDeploy,
} from '../definitions/index.js';
import { InfrastructureProcessAndDeployForAll } from './infrastructure-process-and-deploy.js';

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

  it('should run processors and forward the call to InfrastructureDeploy', async () => {
    const { context: clonedContext, functionRegistry } = createContext();
    const deployMock = registerMockFunction(
      functionRegistry,
      InfrastructureDeploy,
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
  });
});
