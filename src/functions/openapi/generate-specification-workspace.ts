import { callDeferred, type WorkspaceContext } from '@causa/workspace';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';

/**
 * Implements {@link OpenApiGenerateSpecification} for the Causa workspace, outside of any actual project.
 * This triggers the generation of the OpenAPI documentation for all projects in the workspace, ignoring projects for
 * which the generation is not supported. Then, it merges all the generated documentation into a single file.
 */
export class OpenApiGenerateSpecificationForWorkspace extends OpenApiGenerateSpecification {
  async _call(context: WorkspaceContext): Promise<string> {
    return await callDeferred(this, context, import.meta.url);
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.get('project.name') === undefined &&
      context.get('project.type') === undefined &&
      context.get('project.language') === undefined
    );
  }
}
