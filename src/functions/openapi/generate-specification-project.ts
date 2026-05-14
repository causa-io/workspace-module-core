import { callDeferred } from '@causa/workspace';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';

/**
 * Implements {@link OpenApiGenerateSpecification} for a project by merging OpenAPI specification files matched by glob
 * patterns configured in `openApi.specifications`.
 */
export class OpenApiGenerateSpecificationForProjectByMerging extends OpenApiGenerateSpecification {
  async _call(): Promise<string> {
    return await callDeferred(this, import.meta.url);
  }

  _supports(): boolean {
    const projectDefined = this._context.get('project') !== undefined;
    const specifications = this._context
      .asConfiguration<OpenApiConfiguration>()
      .get('openApi.specifications');
    return projectDefined && Array.isArray(specifications);
  }
}
