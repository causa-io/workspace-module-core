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
  EnvironmentDeploy,
  InfrastructureProcessAndDeploy,
} from '../definitions/index.js';
import { EnvironmentDeployForAll } from './environment-deploy.js';

describe('EnvironmentDeployForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let processAndDeployMock: WorkspaceFunctionCallMock<InfrastructureProcessAndDeploy>;

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
      functions: [EnvironmentDeployForAll],
    }));
    processAndDeployMock = registerMockFunction(
      functionRegistry,
      InfrastructureProcessAndDeploy,
      async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    );
    jest.spyOn(context, 'clone').mockResolvedValue(context);
  });

  it('should throw if the environment is not set', async () => {
    ({ context } = createContext({
      environment: null,
      functions: [EnvironmentDeployForAll],
    }));

    const actualPromise = context.call(EnvironmentDeploy, { deployment: '🚀' });

    await expect(actualPromise).rejects.toThrow(EnvironmentNotSetError);
  });

  it('should throw if the environment project is not set', async () => {
    ({ context } = createContext({
      environment: 'dev',
      functions: [EnvironmentDeployForAll],
    }));

    const actualPromise = context.call(EnvironmentDeploy, { deployment: '🚀' });

    await expect(actualPromise).rejects.toThrow(
      ConfigurationValueNotFoundError,
    );
  });

  it('should clone the context and call process and deploy', async () => {
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
      functions: [EnvironmentDeployForAll],
    }));
    jest.spyOn(context, 'clone').mockResolvedValue(clonedContext);

    await context.call(EnvironmentDeploy, { deployment: '🚀' });

    expect(processAndDeployMock).toHaveBeenCalledExactlyOnceWith(
      clonedContext,
      { deployment: '🚀' },
    );
    expect(context.clone).toHaveBeenCalledExactlyOnceWith({
      workingDirectory: '/root/dir/somewhere/my/proj',
    });
  });

  it('should call process and deploy on the context if it is already set for the environment project', async () => {
    await context.call(EnvironmentDeploy, { deployment: '🚀' });

    expect(processAndDeployMock).toHaveBeenCalledExactlyOnceWith(context, {
      deployment: '🚀',
    });
    expect(context.clone).not.toHaveBeenCalled();
  });
});
