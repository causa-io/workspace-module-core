import { WorkspaceContext } from '@causa/workspace';
import { expect } from 'expect';
import { readFile, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import jsone from 'json-e';
import { resolve } from 'path';
import {
  type RetryPolicy,
  type Scenario,
  ScenarioFailedError,
  ScenarioRun,
  type ScenarioRunSnapshot,
  type ScenarioStep,
  type ScenarioStepRun,
} from '../../definitions/index.js';
import { collectStepRefs } from '../../scenarios/dependencies.js';

/**
 * Thrown by {@link ScenarioRunForAll.withRetry} when all attempts fail. Carries the last error encountered and the
 * total number of attempts made.
 */
class RetryAttemptsExhaustedError extends Error {
  constructor(
    readonly cause: unknown,
    readonly attempt: number,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

/**
 * Implements {@link ScenarioRun}. Loads a scenario YAML file, resolves inputs and configuration references, and
 * executes the scenario's steps in dependency order, running independent steps in parallel.
 */
export class ScenarioRunForAll extends ScenarioRun {
  async _call(context: WorkspaceContext): Promise<ScenarioRunSnapshot> {
    const filePath = resolve(context.rootPath, this.path);

    context.logger.info(`▶️ Running scenario from '${filePath}'.`);

    const raw = await readFile(filePath, 'utf-8');
    const scenario = load(raw) as Scenario;

    const inputValues = this.resolveInputs(scenario);
    const { stepDeps, allConfigPaths } = collectStepRefs(scenario);
    const configValues = new Map(
      await Promise.all(
        [...allConfigPaths].map(
          async (path) =>
            [path, await context.getAndRenderOrThrow(path)] as const,
        ),
      ),
    );

    const outputs: Record<string, any> = {};
    const renderContext = {
      input: (name: string) => inputValues[name],
      output: (id: string) => outputs[id],
      configuration: (path: string) => {
        if (!configValues.has(path)) {
          throw new Error(
            `Configuration path '${path}' was not resolved up-front.`,
          );
        }
        return configValues.get(path);
      },
    };

    const result = await this.runSteps(
      context,
      scenario,
      stepDeps,
      renderContext,
      outputs,
    );

    if (this.output) {
      const outputPath = resolve(context.rootPath, this.output);
      await writeFile(outputPath, dump(result));
      context.logger.info(`📝 Wrote scenario result to '${outputPath}'.`);
    }

    if (result.status === 'failed') {
      throw new ScenarioFailedError(result);
    }

    return result;
  }

  /**
   * Schedules and runs the scenario's steps in dependency order, running independent steps in parallel. Emits a
   * snapshot through {@link ScenarioRun.onStepUpdate} on every step transition.
   *
   * @param context The workspace context to forward to step calls.
   * @param scenario The scenario whose steps should be executed.
   * @param stepDeps For each step, the set of other steps it depends on.
   * @param renderContext The render context used to evaluate step arguments and expectations.
   * @param outputs The map of step outputs, populated as steps complete.
   * @returns The final {@link ScenarioRunSnapshot}.
   */
  private async runSteps(
    context: WorkspaceContext,
    scenario: Scenario,
    stepDeps: Record<string, Set<string>>,
    renderContext: Record<string, any>,
    outputs: Record<string, any>,
  ): Promise<ScenarioRunSnapshot> {
    let status: ScenarioRunSnapshot['status'] = 'running';
    const remaining = new Set(Object.keys(scenario.steps));
    const running = new Map<
      string,
      Promise<{ id: string; result: ScenarioStepRun }>
    >();
    const stepResults: Record<string, ScenarioStepRun> = Object.fromEntries(
      Object.keys(scenario.steps).map((id) => [
        id,
        { status: 'pending', numRetries: 0 },
      ]),
    );

    const emitSnapshot = (): void => {
      this.onStepUpdate?.({ status, steps: structuredClone(stepResults) });
    };
    const updateStep = (id: string, result: ScenarioStepRun): void => {
      stepResults[id] = result;
      emitSnapshot();
    };
    emitSnapshot();

    const scheduleReady = (): void => {
      if (status !== 'running') {
        return;
      }

      [...remaining]
        .filter((id) => [...stepDeps[id]].every((d) => d in outputs))
        .forEach((id) => {
          remaining.delete(id);
          const startedAt = new Date();
          updateStep(id, { status: 'running', startedAt, numRetries: 0 });
          const runPromise = this.runStep(
            context,
            id,
            scenario,
            renderContext,
            startedAt,
          );
          running.set(
            id,
            runPromise.then((result) => ({ id, result })),
          );
        });
    };

    scheduleReady();
    while (running.size > 0) {
      const { id, result } = await Promise.race(running.values());
      running.delete(id);
      updateStep(id, result);

      if (result.status === 'succeeded') {
        outputs[id] = result.output;
        scheduleReady();
      } else {
        status = 'failed';
      }
    }

    if (status !== 'failed' && remaining.size > 0) {
      throw new Error(
        `Cannot make progress. Remaining steps have unresolved dependencies: ${[
          ...remaining,
        ].join(', ')}.`,
      );
    }

    for (const id of remaining) {
      updateStep(id, { status: 'skipped', numRetries: 0 });
    }
    if (status === 'running') {
      status = 'succeeded';
    }
    emitSnapshot();

    return { status, steps: stepResults };
  }

  /**
   * Runs a single step with retry. Returns the final `succeeded` or `failed` {@link ScenarioStepRun}.
   *
   * @param context The workspace context to use for the step call.
   * @param id The step ID.
   * @param scenario The scenario.
   * @param renderContext The global render context to use for rendering step arguments and expectations.
   * @param startedAt The time at which the step started.
   * @returns The final `succeeded` or `failed` {@link ScenarioStepRun} for the step.
   */
  private async runStep(
    context: WorkspaceContext,
    id: string,
    scenario: Scenario,
    renderContext: Record<string, any>,
    startedAt: Date,
  ): Promise<ScenarioStepRun> {
    const step = scenario.steps[id];
    context.logger.info(
      `▶️ Starting step '${id}' (calling '${step.call.name}').`,
    );

    let output: any;
    let attempt: number;
    let status: ScenarioStepRun['status'];
    let error: string | undefined;
    try {
      ({ attempt } = await this.withRetry(
        step.retry,
        ({ attempt, maxAttempts, error }) => {
          const message =
            error instanceof Error ? error.message : String(error);
          const firstLine = message.split('\n')[0];
          context.logger.warn(
            `⚠️ Step '${id}' attempt ${attempt}/${maxAttempts} failed: ${firstLine}`,
          );
        },
        async () => {
          output = undefined;
          const args = jsone(
            {
              ...scenario.defaultCallArgs?.[step.call.name],
              ...step.call.args,
            },
            renderContext,
          );
          output = await context.callByName(step.call.name, args);
          this.verifyStep(step, id, output, renderContext);
        },
      ));

      status = 'succeeded';
    } catch (e) {
      if (!(e instanceof RetryAttemptsExhaustedError)) {
        throw e;
      }

      status = 'failed';
      attempt = e.attempt;
      error = e.message;
    }

    const numRetries = attempt - 1;
    const endedAt = new Date();
    const duration = endedAt.getTime() - startedAt.getTime();
    if (status === 'succeeded') {
      context.logger.info(
        `✅ Step '${id}' finished in ${duration}ms (${attempt} attempt(s)).`,
      );
    } else {
      context.logger.error(
        `❌ Step '${id}' failed after ${attempt} attempt(s) in ${duration}ms: ${error}`,
      );
    }

    return { status, output, startedAt, endedAt, numRetries, error };
  }

  /**
   * Runs `fn` up to `retry.maxAttempts` times (defaults to 1, i.e. no retry), waiting `retry.delay` ms between
   * attempts.
   *
   * @param retry The retry policy to apply.
   * @param onRetry A callback invoked after a failed attempt.
   * @param fn The function to run.
   * @return The value returned by `fn` on a successful attempt, and the total number of attempts made.
   */
  private async withRetry<T>(
    retry: RetryPolicy | undefined,
    onRetry: (info: {
      attempt: number;
      maxAttempts: number;
      error: unknown;
    }) => void,
    fn: () => Promise<T>,
  ): Promise<{
    /**
     * The value returned by `fn` on a successful attempt.
     */
    result: T;

    /**
     * The number of attempts that were needed to get a successful result.
     */
    attempt: number;
  }> {
    const maxAttempts = retry?.maxAttempts ?? 1;
    const delay = retry?.delay ?? 0;

    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await fn();
        return { result, attempt };
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          onRetry({ attempt, maxAttempts, error });
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
    }

    throw new RetryAttemptsExhaustedError(lastError, attempt);
  }

  /**
   * Evaluates each expectation against the rendered `actual` (defaulting to the call output) using either `toEqual` or
   * `toMatchObject`. Throws on the first failed expectation.
   *
   * Builds a step-local render context that shadows `output(<id>)` so the current step's output is available before it
   * has been published to the global outputs map.
   *
   * @param step The step whose expectations to verify.
   * @param id The step ID.
   * @param output The step's call output, to make available to expectations.
   * @param renderContext The global render context, used as a base for the step-local context.
   */
  private verifyStep(
    step: ScenarioStep,
    id: string,
    output: any,
    renderContext: Record<string, any>,
  ): void {
    const verifyRenderContext = {
      ...renderContext,
      output: (refId: string) =>
        refId === id ? output : renderContext.output(refId),
    };

    for (const exp of step.expectations ?? []) {
      const actual =
        exp.actual !== undefined
          ? jsone(exp.actual, verifyRenderContext)
          : output;
      const expectedValue = jsone(exp.value, verifyRenderContext);
      const isObject =
        expectedValue !== null && typeof expectedValue === 'object';
      try {
        if (exp.exact || !isObject) {
          expect(actual).toEqual(expectedValue);
        } else {
          expect(actual).toMatchObject(expectedValue);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const prefix = exp.description
          ? `Expectation '${exp.description}' failed.`
          : 'Expectation failed.';
        throw new Error(`${prefix}\n${detail}`);
      }
    }
  }

  /**
   * Resolves the actual input values for the scenario, applying defaults and validating that all declared inputs are
   * either provided or have a default.
   *
   * @param scenario The scenario whose inputs to resolve.
   * @return The resolved input values, keyed by input name.
   */
  private resolveInputs(scenario: Scenario): Record<string, any> {
    const provided = this.inputs ?? {};
    const declared = scenario.inputs ?? {};
    const resolved: Record<string, any> = {};

    for (const [name, def] of Object.entries(declared)) {
      if (name in provided) {
        resolved[name] = provided[name];
      } else if (def.default !== undefined) {
        resolved[name] = def.default;
      } else {
        throw new Error(`Missing required input '${name}'.`);
      }
    }

    return resolved;
  }

  _supports(): boolean {
    return true;
  }
}
