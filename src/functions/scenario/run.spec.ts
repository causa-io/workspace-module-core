import { WorkspaceContext, WorkspaceFunction } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  type WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { AllowMissing } from '@causa/workspace/validation';
import { IsString } from 'class-validator';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { dump } from 'js-yaml';
import { join, resolve } from 'path';
import {
  Scenario,
  ScenarioFailedError,
  ScenarioRun,
} from '../../definitions/index.js';
import { ScenarioRunForAll } from './run.js';

abstract class TestStep extends WorkspaceFunction<Promise<any>> {
  @AllowMissing()
  @IsString()
  readonly value?: string;

  @AllowMissing()
  @IsString()
  readonly dependsOn?: string;
}

abstract class SourceStep extends WorkspaceFunction<Promise<any>> {}

describe('ScenarioRunForAll', () => {
  let tmpDir: string;
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let stepMock: WorkspaceFunctionCallMock<TestStep>;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp('causa-test-'));
    ({ context, functionRegistry } = createContext({
      rootPath: tmpDir,
      functions: [ScenarioRunForAll],
    }));
    stepMock = registerMockFunction(functionRegistry, TestStep, async () => ({
      ok: true,
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeScenario(scenario: Scenario): Promise<string> {
    const path = join(tmpDir, 'scenario.yaml');
    await writeFile(path, dump(scenario));
    return path;
  }

  it('should run a scenario, expose outputs to dependent steps, and write the result file', async () => {
    stepMock.mockImplementation(async (_, { value }) => ({ value }));
    await writeScenario({
      id: 'happy',
      steps: {
        first: { call: { name: 'TestStep', args: { value: 'one' } } },
        second: {
          call: {
            name: 'TestStep',
            args: { value: "${ output('first').value + '-two' }" },
          },
          expectations: [{ value: { value: 'one-two' } }],
        },
      },
    });

    const actual = await context.call(ScenarioRun, {
      path: 'scenario.yaml',
      output: 'result.yaml',
    });

    expect(actual).toEqual({
      status: 'succeeded',
      steps: {
        first: {
          status: 'succeeded',
          output: { value: 'one' },
          numRetries: 0,
          error: undefined,
          startedAt: expect.any(Date),
          endedAt: expect.toBeAfterOrEqualTo(actual.steps.first.startedAt!),
        },
        second: {
          status: 'succeeded',
          output: { value: 'one-two' },
          numRetries: 0,
          error: undefined,
          startedAt: expect.toBeAfterOrEqualTo(actual.steps.first.endedAt!),
          endedAt: expect.toBeAfterOrEqualTo(actual.steps.second.startedAt!),
        },
      },
    });
    expect(stepMock).toHaveBeenCalledTimes(2);
    expect(stepMock).toHaveBeenCalledWith(context, { value: 'one' });
    expect(stepMock).toHaveBeenCalledWith(context, { value: 'one-two' });
    const written = await readFile(join(tmpDir, 'result.yaml'), 'utf-8');
    expect(written).toContain('status: succeeded');
    expect(written).toContain('first:');
    expect(written).toContain('second:');
  });

  it('should fail and skip dependent steps when a step call throws', async () => {
    stepMock.mockImplementation(async (_, { value }) => {
      if (value === 'boom') {
        throw new Error('💥');
      }
      return { value };
    });
    const scenarioPath = await writeScenario({
      id: 'failing',
      steps: {
        first: { call: { name: 'TestStep', args: { value: 'boom' } } },
        second: {
          call: {
            name: 'TestStep',
            args: { value: "${ output('first').value }" },
          },
        },
      },
    });

    const actualPromise = context.call(ScenarioRun, { path: scenarioPath });

    await expect(actualPromise).rejects.toBeInstanceOf(ScenarioFailedError);
    await expect(actualPromise).rejects.toHaveProperty('result', {
      status: 'failed',
      steps: {
        first: {
          status: 'failed',
          error: '💥',
          numRetries: 0,
          output: undefined,
          startedAt: expect.any(Date),
          endedAt: expect.any(Date),
        },
        second: { status: 'skipped', numRetries: 0 },
      },
    });
  });

  it('should retry a step until it succeeds', async () => {
    let attempts = 0;
    stepMock.mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`fail ${attempts}`);
      }
      return { attempts };
    });
    const scenarioPath = await writeScenario({
      id: 'retry',
      steps: {
        only: {
          call: { name: 'TestStep', args: { value: 'x' } },
          retry: { maxAttempts: 3, delay: 0 },
        },
      },
    });

    const actual = await context.call(ScenarioRun, { path: scenarioPath });

    expect(actual).toEqual({
      status: 'succeeded',
      steps: {
        only: {
          status: 'succeeded',
          output: { attempts: 3 },
          numRetries: 2,
          error: undefined,
          startedAt: expect.any(Date),
          endedAt: expect.any(Date),
        },
      },
    });
    expect(stepMock).toHaveBeenCalledTimes(3);
  });

  it('should fail the step when an expectation does not match', async () => {
    const scenarioPath = await writeScenario({
      id: 'expect-fail',
      steps: {
        only: {
          call: { name: 'TestStep', args: { value: 'x' } },
          expectations: [
            { description: 'value matches', value: { ok: false } },
          ],
        },
      },
    });

    const actualPromise = context.call(ScenarioRun, { path: scenarioPath });

    await expect(actualPromise).rejects.toBeInstanceOf(ScenarioFailedError);
    await expect(actualPromise).rejects.toHaveProperty('result', {
      status: 'failed',
      steps: {
        only: {
          status: 'failed',
          error: expect.stringContaining("Expectation 'value matches' failed"),
          numRetries: 0,
          output: { ok: true },
          startedAt: expect.any(Date),
          endedAt: expect.any(Date),
        },
      },
    });
  });

  it('should merge defaultCallArgs and resolve their templates', async () => {
    stepMock.mockImplementation(async (_, { value, dependsOn }) => ({
      value,
      dependsOn,
    }));
    const sourceMock = registerMockFunction(
      functionRegistry,
      SourceStep,
      async () => ({ value: 'from-source' }),
    );
    await writeScenario({
      id: 'defaults',
      defaultCallArgs: {
        TestStep: {
          value: 'default-value',
          dependsOn: "${ output('source').value }",
        },
      },
      steps: {
        source: { call: { name: 'SourceStep' } },
        overrides: {
          call: { name: 'TestStep', args: { value: 'override' } },
        },
        defaulted: {
          call: { name: 'TestStep' },
        },
      },
    });

    const actual = await context.call(ScenarioRun, { path: 'scenario.yaml' });

    expect(actual).toEqual({
      status: 'succeeded',
      steps: {
        source: {
          status: 'succeeded',
          output: { value: 'from-source' },
          numRetries: 0,
          error: undefined,
          startedAt: expect.any(Date),
          endedAt: expect.toBeAfterOrEqualTo(actual.steps.source.startedAt!),
        },
        overrides: {
          status: 'succeeded',
          output: { value: 'override', dependsOn: 'from-source' },
          numRetries: 0,
          error: undefined,
          startedAt: expect.toBeAfterOrEqualTo(actual.steps.source.endedAt!),
          endedAt: expect.toBeAfterOrEqualTo(actual.steps.overrides.startedAt!),
        },
        defaulted: {
          status: 'succeeded',
          output: { value: 'default-value', dependsOn: 'from-source' },
          numRetries: 0,
          error: undefined,
          startedAt: expect.toBeAfterOrEqualTo(actual.steps.source.endedAt!),
          endedAt: expect.toBeAfterOrEqualTo(actual.steps.defaulted.startedAt!),
        },
      },
    });
    expect(sourceMock).toHaveBeenCalledOnce();
  });

  it('should throw when a step references an unknown step', async () => {
    const scenarioPath = await writeScenario({
      id: 'bad-dep',
      steps: {
        only: {
          call: {
            name: 'TestStep',
            args: { value: "${ output('missing') }" },
          },
        },
      },
    });

    const actualPromise = context.call(ScenarioRun, { path: scenarioPath });

    await expect(actualPromise).rejects.toThrow(
      "Step 'only' references unknown step 'missing'.",
    );
    expect(stepMock).not.toHaveBeenCalled();
  });
});
