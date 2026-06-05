import { collectStepRefs } from './dependencies.js';
import type { Scenario } from './generated.js';

function makeScenario(steps: Record<string, any>): Scenario {
  return { steps } as Scenario;
}

describe('collectStepRefs', () => {
  // Steps that the `target` step under test can reference; always present so each case only defines its own `target`.
  const DEPENDENCY_STEPS = {
    first: { call: { name: 'Step' } },
    second: { call: { name: 'Step' } },
    third: { call: { name: 'Step' } },
  };

  it.each([
    {
      name: 'output and configuration references from step arguments',
      args: {
        fromOutput: "${ output('first').body }",
        fromConfig: "${ configuration('a.b') }",
      },
      expectedDeps: ['first'],
      expectedConfigs: ['a.b'],
    },
    {
      name: 'a reference even when a builtin is applied to a member access on it',
      args: { value: "${ str(output('first').body) }" },
      expectedDeps: ['first'],
    },
    {
      name: 'references from multiple interpolations in a single string',
      args: {
        value:
          "${ str(output('first')[0].id) }-${ output('second') }${ configuration('a.b') }",
      },
      expectedDeps: ['first', 'second'],
      expectedConfigs: ['a.b'],
    },
    {
      name: 'references nested in array arguments',
      args: { list: ["${ output('first') }", "${ output('second').id }"] },
      expectedDeps: ['first', 'second'],
    },
    {
      name: 'references from both branches of a json-e operator',
      args: {
        value: {
          $if: "output('first').ready",
          then: "${ output('second') }",
          else: "${ output('third') }",
        },
      },
      expectedDeps: ['first', 'second', 'third'],
    },
    {
      name: 'no references from a plain string that merely mentions output',
      args: { description: "this step mirrors output('first') by hand" },
      expectedDeps: [],
    },
    {
      name: 'references from the condition keys of a $switch',
      args: {
        value: {
          $switch: {
            "output('first').ready": "${ output('second') }",
            $default: "${ output('third') }",
          },
        },
      },
      expectedDeps: ['first', 'second', 'third'],
    },
    {
      name: 'references from expectations and explicit dependencies',
      expectations: [
        {
          actual: "${ str(output('first').count) }",
          value: "${ output('second').value }",
        },
      ],
      after: ['third'],
      expectedDeps: ['first', 'second', 'third'],
    },
    {
      name: 'references from merged default call arguments',
      defaultCallArgs: { Target: { value: "${ output('first') }" } },
      expectedDeps: ['first'],
    },
  ])(
    'collects $name',
    ({
      args,
      expectations,
      after,
      defaultCallArgs,
      expectedDeps,
      expectedConfigs = [],
    }) => {
      const scenario = {
        defaultCallArgs,
        steps: {
          ...DEPENDENCY_STEPS,
          target: { call: { name: 'Target', args }, expectations, after },
        },
      } as unknown as Scenario;

      const { stepDeps, allConfigPaths } = collectStepRefs(scenario);

      expect([...stepDeps.target]).toIncludeSameMembers(expectedDeps);
      expect([...allConfigPaths]).toIncludeSameMembers(expectedConfigs);
    },
  );

  it('throws when a step references its own output in its arguments', () => {
    const scenario = makeScenario({
      target: {
        call: { name: 'Target', args: { value: "${ output('target') }" } },
      },
    });

    expect(() => collectStepRefs(scenario)).toThrow(
      "Step 'target' references its own output in its arguments.",
    );
  });

  it('throws when a step references an unknown step', () => {
    const scenario = makeScenario({
      target: {
        call: { name: 'Target', args: { value: "${ output('missing') }" } },
      },
    });

    expect(() => collectStepRefs(scenario)).toThrow(
      "Step 'target' references unknown step 'missing'.",
    );
  });
});
