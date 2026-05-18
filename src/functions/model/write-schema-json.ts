import type { ModelConfiguration } from '../../configurations/index.js';
import { ModelSchemaWrite } from '../../definitions/index.js';
import { apply, remove, rename } from '../../jsonschema/index.js';

/**
 * Implements {@link ModelSchemaWrite} for JSON Schema models. Dispatches the requested action to the corresponding
 * writer helper.
 */
export class ModelSchemaWriteForJsonSchema extends ModelSchemaWrite {
  async _call(): Promise<string> {
    switch (this.action.type) {
      case 'apply':
        return apply(this.contents, this.action.schema);
      case 'delete':
        return remove(this.contents, this.action.path);
      case 'rename':
        return rename(
          this.contents,
          this.action.oldFragment,
          this.action.newFragment,
        );
    }
  }

  _supports(): boolean {
    return (
      this._context
        .asConfiguration<ModelConfiguration>()
        .get('model.schema') === 'jsonschema'
    );
  }
}
