import { WorkspaceContext } from '@causa/workspace';
import { join } from 'path';
import { InfrastructureConfiguration } from './configurations/index.js';

/**
 * Returns a context configured with the environment project.
 * The location of the environment project is read from the `infrastructure.environmentProject` configuration.
 * If the input context is already configured for the correct project, it is simply returned. If not, it is cloned.
 *
 * @param context The current {@link WorkspaceContext}.
 * @returns The input context, or a clone with the proper {@link WorkspaceContext.workingDirectory}.
 */
export async function cloneContextForEnvironmentProjectIfNeeded(
  context: WorkspaceContext,
): Promise<WorkspaceContext> {
  context.getEnvironmentOrThrow();

  const relativeProjectPath = context.getOrThrow(
    'infrastructure.environmentProject',
  );

  const projectPath = join(context.rootPath, relativeProjectPath);
  if (context.projectPath === projectPath) {
    context.logger.debug(
      '📂 The current project is already the configured environment project.',
    );
    return context;
  }

  context.logger.debug(
    '📂 Initializing a new context with the configured environment project.',
  );
  return await context.clone({ workingDirectory: projectPath });
}

/**
 * Runs the given operation after having run the processors defined in the `infrastructure.processors` configuration.
 * Processors are also torn down after the operation.
 *
 * @param context The current {@link WorkspaceContext}.
 * @param operation The operation to run. The passed context will be the input context if no processor is defined.
 * @returns The result of the operation.
 */
export async function wrapInfrastructureOperation<T>(
  context: WorkspaceContext,
  operation: (context: WorkspaceContext) => Promise<T>,
): Promise<T> {
  const processors =
    context
      .asConfiguration<InfrastructureConfiguration>()
      .get('infrastructure.processors') ?? [];

  if (processors.length > 0) {
    context = await context.clone({ processors });
  }

  try {
    const result = await operation(context);
    return result;
  } finally {
    for (const processor of [...processors].reverse()) {
      const { name, args } = processor;

      context.logger.debug(`🔨 Tearing down processor '${name}'.`);

      await context.callByName(name, { ...args, tearDown: true });
    }
  }
}
