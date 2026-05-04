import jsone from 'json-e';
import type { Scenario } from './index.js';

/**
 * Builds a permissive proxy that absorbs arbitrary property accesses and function calls, returning another proxy
 * recursively. Used as a placeholder value during dependency detection so json-e expressions like
 * `${ output('x').body.id }` evaluate without throwing.
 */
function makeSpyValue(): any {
  const target: any = function () {};
  return new Proxy(target, {
    get(_, prop) {
      if (prop === Symbol.toPrimitive) {
        return () => '';
      }

      if (prop === 'toString') {
        return () => '';
      }

      return makeSpyValue();
    },
    apply() {
      return makeSpyValue();
    },
  });
}

/**
 * Detects which step outputs and configuration paths are referenced by `args` by rendering it through json-e with a
 * spy context that records every `output('<id>')` and `configuration('<path>')` call. The spy returns a permissive
 * value, so member accesses and chained calls in templates do not break detection. Errors raised by json-e are
 * swallowed: references collected up to the error are still returned, which is sufficient since unresolved references
 * will surface again at actual rendering time.
 *
 * @param args The (potentially nested) value to scan for references.
 * @returns The set of output IDs and configuration paths referenced in `args`.
 */
function findRefs(args: any): {
  /**
   * The IDs of the step outputs referenced in `args`, from expressions like `${ output('<id>') }`.
   */
  outputs: Set<string>;

  /**
   * The configuration paths referenced in `args`, from expressions like `${ configuration('<path>') }`.
   */
  configurations: Set<string>;
} {
  const outputs = new Set<string>();
  const configurations = new Set<string>();
  if (args === undefined || args === null) {
    return { outputs, configurations };
  }

  try {
    jsone(args, {
      input: () => makeSpyValue(),
      output: (id: string) => {
        if (typeof id === 'string') {
          outputs.add(id);
        }

        return makeSpyValue();
      },
      configuration: (path: string) => {
        if (typeof path === 'string') {
          configurations.add(path);
        }

        return makeSpyValue();
      },
    });
  } catch {
    // Partial detection is acceptable; rendering will fail loudly later if a ref is missed.
  }

  return { outputs, configurations };
}

/**
 * Walks every step in the scenario and computes:
 * - the set of other-step output IDs each step depends on (from its `args` and `expectations`);
 * - the global set of configuration paths referenced by any step.
 *
 * Throws if a step references its own output in its arguments, or references an unknown step.
 *
 * @param scenario The scenario to analyze.
 * @returns An object containing the step dependencies and referenced configuration paths.
 */
export function collectStepRefs(scenario: Scenario): {
  /**
   * For each step, the set of other steps it depends on (i.e. whose outputs it references in `args` or `expectations`).
   */
  stepDeps: Record<string, Set<string>>;

  /**
   * The global set of configuration paths referenced by any step.
   */
  allConfigPaths: Set<string>;
} {
  const stepDeps: Record<string, Set<string>> = {};
  const allConfigPaths = new Set<string>();

  for (const [id, step] of Object.entries(scenario.steps)) {
    const argsRefs = findRefs({
      ...scenario.defaultCallArgs?.[step.call.name],
      ...step.call.args,
    });
    if (argsRefs.outputs.has(id)) {
      throw new Error(
        `Step '${id}' references its own output in its arguments.`,
      );
    }

    const outputDeps = new Set<string>(argsRefs.outputs);
    for (const path of argsRefs.configurations) {
      allConfigPaths.add(path);
    }

    for (const exp of step.expectations ?? []) {
      for (const refs of [findRefs(exp.actual), findRefs(exp.value)]) {
        for (const dep of refs.outputs) {
          outputDeps.add(dep);
        }
        for (const path of refs.configurations) {
          allConfigPaths.add(path);
        }
      }
    }

    for (const dep of step.after ?? []) {
      outputDeps.add(dep);
    }

    outputDeps.delete(id);
    for (const dep of outputDeps) {
      if (!(dep in scenario.steps)) {
        throw new Error(`Step '${id}' references unknown step '${dep}'.`);
      }
    }

    stepDeps[id] = outputDeps;
  }

  return { stepDeps, allConfigPaths };
}
