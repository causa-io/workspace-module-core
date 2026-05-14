import { callDeferred } from '@causa/workspace';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';

/**
 * Implements {@link OpenApiGenerateSpecification} for the Causa workspace, outside of any actual project.
 * This triggers the generation of the OpenAPI documentation for all projects in the workspace, ignoring projects for
 * which the generation is not supported. Then, it merges all the generated documentation into a single file.
 */
export class OpenApiGenerateSpecificationForWorkspace extends OpenApiGenerateSpecification {
  async _call(): Promise<string> {
    return await callDeferred(this, import.meta.url);
  }

  _supports(): boolean {
    return (
      this._context.get('project.name') === undefined &&
      this._context.get('project.type') === undefined &&
      this._context.get('project.language') === undefined
    );
  }
}
