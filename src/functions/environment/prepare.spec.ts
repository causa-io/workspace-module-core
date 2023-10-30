import { EnvironmentNotSetError, WorkspaceContext } from '@causa/workspace';
import { ConfigurationValueNotFoundError } from '@causa/workspace/configuration';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  EnvironmentPrepare,
  InfrastructureProcessAndPrepare,
} from '../../definitions/index.js';
import { EnvironmentPrepareForAll } from './prepare.js';

describe('EnvironmentPrepareForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let processAndPrepareMock: WorkspaceFunctionCallMock<InfrastructureProcessAndPrepare>;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      workingDirectory: '/root/dir/somewhere/my/proj',
      rootPath: '/root/dir',
      projectPath: '/root/dir/somewhere/my/proj',
      environment: 'dev',
      configuration: {
        workspace: { name: '🧪' },
        infrastructure: { environmentProject: 'somewhere/my/proj' },
      },
      functions: [EnvironmentPrepareForAll],
    }));
    processAndPrepareMock = registerMockFunction(
      functionRegistry,
      InfrastructureProcessAndPrepare,
      async () => ({ isDeploymentNeeded: true, output: '🚀' }),
    );
    jest.spyOn(context, 'clone').mockResolvedValue(context);
  });

  it('should throw if the environment is not set', async () => {
    ({ context } = createContext({
      environment: null,
      functions: [EnvironmentPrepareForAll],
    }));

    const actualPromise = context.call(EnvironmentPrepare, {});

    await expect(actualPromise).rejects.toThrow(EnvironmentNotSetError);
  });

  it('should throw if the environment project is not set', async () => {
    ({ context } = createContext({
      environment: 'dev',
      functions: [EnvironmentPrepareForAll],
    }));

    const actualPromise = context.call(EnvironmentPrepare, {});

    await expect(actualPromise).rejects.toThrow(
      ConfigurationValueNotFoundError,
    );
  });

  it('should clone the context and call process and prepare', async () => {
    const clonedContext = context;
    ({ context } = createContext({
      workingDirectory: '/root/dir',
      rootPath: '/root/dir',
      projectPath: '/root/dir',
      environment: 'dev',
      configuration: {
        workspace: { name: '🧪' },
        infrastructure: { environmentProject: 'somewhere/my/proj' },
      },
      functions: [EnvironmentPrepareForAll],
    }));
    jest.spyOn(context, 'clone').mockResolvedValue(clonedContext);

    const actualResult = await context.call(EnvironmentPrepare, {
      print: false,
      output: '🚄',
    });

    expect(actualResult).toEqual({ isDeploymentNeeded: true, output: '🚀' });
    expect(processAndPrepareMock).toHaveBeenCalledExactlyOnceWith(
      clonedContext,
      { print: false, output: '🚄' },
    );
    expect(context.clone).toHaveBeenCalledExactlyOnceWith({
      workingDirectory: '/root/dir/somewhere/my/proj',
    });
  });

  it('should call process and deploy on the context if it is already set for the environment project', async () => {
    const actualResult = await context.call(EnvironmentPrepare, {
      print: false,
      destroy: true,
      output: '🚄',
    });

    expect(actualResult).toEqual({ isDeploymentNeeded: true, output: '🚀' });
    expect(processAndPrepareMock).toHaveBeenCalledExactlyOnceWith(context, {
      print: false,
      destroy: true,
      output: '🚄',
    });
    expect(context.clone).not.toHaveBeenCalled();
  });
});
