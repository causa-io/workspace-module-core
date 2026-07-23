import type { Scenario } from './index.js';

/**
 * The object keys json-e recognizes as operators, mirroring its `operators` table (json-e 4.8).
 */
const JSONE_OPERATORS = new Set([
  '$eval',
  '$find',
  '$flatten',
  '$flattenDeep',
  '$fromNow',
  '$if',
  '$json',
  '$let',
  '$map',
  '$match',
  '$merge',
  '$mergeDeep',
  '$reduce',
  '$reverse',
  '$sort',
  '$switch',
]);

/**
 * The json-e operators whose operand is a map keyed by condition expressions (`{ "<condition>": <result>, ... }`).
 */
const CONDITION_OPERATORS = new Set(['$match', '$switch']);

/**
 * Matches an `output('<id>')` or `configuration('<path>')` call with a string-literal argument.
 */
const REFERENCE = /(?<![\w.])(output|configuration)\s*\(\s*(['"])(.*?)\2\s*\)/g;

/**
 * Extracts the contents of each `${ ... }` interpolation from a template string, respecting `$${` escapes and quoted
 * substrings so that braces inside string literals do not end an expression early.
 *
 * @param template The string to scan.
 * @returns The expression source of each interpolation, in order.
 */
function extractInterpolations(template: string): string[] {
  const expressions: string[] = [];

  for (let i = 0; i < template.length; i++) {
    // An interpolation starts at `${`, unless it is an escaped `$${`.
    if (!(
      template[i] === '$' &&
      template[i + 1] === '{' &&
      template[i - 1] !== '$'
    )) {
      continue;
    }

    let depth = 1;
    let quote: string | null = null;
    let j = i + 2;
    for (; j < template.length && depth > 0; j++) {
      const char = template[j];
      if (quote !== null) {
        if (char === '\\') {
          j++;
        } else if (char === quote) {
          quote = null;
        }
      } else if (char === "'" || char === '"') {
        quote = char;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }

    if (depth === 0) {
      expressions.push(template.slice(i + 2, j - 1));
      i = j - 1;
    }
  }

  return expressions;
}

/**
 * Detects which step outputs and configuration paths are referenced by `args` by scanning its expressions for
 * `output('<id>')` and `configuration('<path>')` calls.
 *
 * References can occur in only two places, and detection scans exactly those (which keeps a plain string value that
 * merely mentions `output('x')` in prose from being mistaken for a reference):
 * - Inside a `${ ... }` interpolation in any string.
 * - In the raw expression of a json-e operator — e.g. an `$if` condition or an `$eval`.
 *
 * @param args The (potentially nested) value to scan for references.
 * @returns The set of output IDs and configuration paths referenced in `args`.
 */
function findRefs(args: unknown): {
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

  const scan = (expression: string) =>
    expression
      .matchAll(REFERENCE)
      .forEach(([, name, , reference]) =>
        (name === 'output' ? outputs : configurations).add(reference),
      );

  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      extractInterpolations(value).forEach(scan);
      return;
    }

    if (value === null || typeof value !== 'object') {
      return;
    }

    Object.values(value).forEach(visit);

    if (Array.isArray(value)) {
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      // A json-e operator's own value is a raw expression (e.g. an `$if` condition), so scan it as a whole.
      if (JSONE_OPERATORS.has(key) && typeof nested === 'string') {
        scan(nested);
      }

      // `$match` / `$switch` carry their condition expressions as the keys of their operand map (`$default` aside).
      if (
        CONDITION_OPERATORS.has(key) &&
        nested !== null &&
        typeof nested === 'object' &&
        !Array.isArray(nested)
      ) {
        Object.keys(nested).forEach(scan);
      }
    }
  };

  visit(args);

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
