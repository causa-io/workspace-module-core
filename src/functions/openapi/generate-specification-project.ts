import { callDeferred, type WorkspaceContext } from '@causa/workspace';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';

/**
 * Implements {@link OpenApiGenerateSpecification} for a project by merging OpenAPI specification files matched by glob
 * patterns configured in `openApi.specifications`.
 */
export class OpenApiGenerateSpecificationForProjectByMerging extends OpenApiGenerateSpecification {
  async _call(context: WorkspaceContext): Promise<string> {
    return await callDeferred(this, context, import.meta.url);
  }

  _supports(context: WorkspaceContext): boolean {
    const projectDefined = context.get('project') !== undefined;
    const specifications = context
      .asConfiguration<OpenApiConfiguration>()
      .get('openApi.specifications');
    return projectDefined && Array.isArray(specifications);
  }
}
