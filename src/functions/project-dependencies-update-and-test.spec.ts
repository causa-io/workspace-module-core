import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  WorkspaceFunctionCallMock,
  WorkspaceFunctionMockImplementation,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import {
  ProjectDependenciesUpdate,
  ProjectDependenciesUpdateAndTest,
  ProjectTest,
} from '../definitions/index.js';
import { ProjectDependenciesUpdateAndTestForAll } from './project-dependencies-update-and-test.js';

describe('ProjectDependenciesUpdateAndTestForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let testMock: WorkspaceFunctionCallMock<ProjectTest>;
  let dependenciesUpdateMock: WorkspaceFunctionCallMock<ProjectDependenciesUpdate>;

  function registerTestMock(
    implementation: WorkspaceFunctionMockImplementation<ProjectTest> = async () => {},
  ) {
    testMock = registerMockFunction(
      functionRegistry,
      ProjectTest,
      implementation,
    );
  }

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      functions: [ProjectDependenciesUpdateAndTestForAll],
    }));
    dependenciesUpdateMock = registerMockFunction(
      functionRegistry,
      ProjectDependenciesUpdate,
      async () => {},
    );
  });

  it('should skip tests and update dependencies', async () => {
    registerTestMock();

    await context.call(ProjectDependenciesUpdateAndTest, {
      skipTest: true,
    });

    expect(dependenciesUpdateMock).toHaveBeenCalledExactlyOnceWith(context, {});
    expect(testMock).not.toHaveBeenCalled();
  });

  it('should not fail and log a warning if tests cannot be run', async () => {
    jest.spyOn(context.logger, 'warn');

    await context.call(ProjectDependenciesUpdateAndTest, {});

    expect(dependenciesUpdateMock).toHaveBeenCalledExactlyOnceWith(context, {});
    expect(context.logger.warn).toHaveBeenCalledExactlyOnceWith(
      '⚠️ No implementation exists to run tests for the project, skipping them.',
    );
  });

  it('should throw if tests fail before the update', async () => {
    registerTestMock(async () => {
      throw new Error('💥');
    });

    const actualPromise = context.call(ProjectDependenciesUpdateAndTest, {});

    await expect(actualPromise).rejects.toThrow('💥');
    expect(testMock).toHaveBeenCalledExactlyOnceWith(context, {});
    expect(dependenciesUpdateMock).not.toHaveBeenCalled();
  });

  it('should throw if tests fail after the update', async () => {
    let numCalls = 0;
    registerTestMock(async () => {
      numCalls += 1;

      if (numCalls > 1) {
        throw new Error('💥');
      }
    });

    const actualPromise = context.call(ProjectDependenciesUpdateAndTest, {});

    await expect(actualPromise).rejects.toThrow('💥');
    expect(testMock).toHaveBeenCalledTimes(2);
    expect(dependenciesUpdateMock).toHaveBeenCalledExactlyOnceWith(context, {});
  });

  it('should run tests and update dependencies', async () => {
    registerTestMock();

    await context.call(ProjectDependenciesUpdateAndTest, {});

    expect(testMock).toHaveBeenCalledTimes(2);
    expect(dependenciesUpdateMock).toHaveBeenCalledExactlyOnceWith(context, {});
  });
});
