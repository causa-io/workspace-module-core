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
 * Returns a {@link WorkspaceContext} where the processors defined in the `infrastructure.processors` configuration has
 * been applied. If no processor is defined, the input context is returned.
 *
 * @param context The current {@link WorkspaceContext}.
 * @returns The input context, or a clone with the processors applied.
 */
export async function cloneContextWithInfrastructureProcessorsIfNeeded(
  context: WorkspaceContext,
): Promise<WorkspaceContext> {
  const processors =
    context
      .asConfiguration<InfrastructureConfiguration>()
      .get('infrastructure.processors') ?? [];

  if (processors.length > 0) {
    return await context.clone({ processors });
  }

  return context;
}
