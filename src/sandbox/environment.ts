/**
 * Combines the caller's environment with the changes the sandbox runtime needs to apply to the spawned process.
 *
 * The sandbox returns a full environment, most of which is identical to the current process's environment. Spreading it
 * wholesale over the caller's environment would overwrite the variables the caller explicitly set. Instead, only the
 * variables the sandbox actually added or changed (compared to the current process's environment) are layered on top of
 * the caller's environment. This preserves the caller's customizations while still applying what the sandbox requires.
 *
 * @param callerEnvironment The environment requested by the caller, if any. Defaults to {@link process.env}.
 * @param sandboxEnvironment The environment returned by the sandbox runtime when wrapping the command.
 * @returns The environment to pass to the spawned process.
 */
export function mergeSandboxEnvironment(
  callerEnvironment: Record<string, string | undefined> | undefined,
  sandboxEnvironment: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const base = callerEnvironment ?? process.env;

  const delta: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(sandboxEnvironment)) {
    if (process.env[name] !== value) {
      delta[name] = value;
    }
  }

  return { ...base, ...delta };
}
