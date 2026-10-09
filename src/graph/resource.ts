import type { WorkspaceContext } from '@causa/workspace';

/**
 * The infrastructure resource a node stands for, stored in the node's `data.resource`.
 * It allows fetching data about the resource from the provider, e.g. metrics.
 *
 * Identifiers can reference the workspace configuration for the parts that depend on the environment using Causa
 * templates such as `${ configuration('myVar') }`.
 */
export type GraphResource = {
  /**
   * The type of the resource.
   */
  readonly type: string;

  /**
   * The ID of the project node whose configuration should be used to render the identifier.
   * When absent, the identifier should be rendered using the workspace configuration.
   */
  readonly scope?: string;
} & (
  | {
      /**
       * The identifier of the resource for its provider.
       */
      readonly id: string;
      readonly idPrefix?: never;
    }
  | {
      readonly id?: never;

      /**
       * A prefix of the identifier, when the full identifier cannot be known from the workspace.
       */
      readonly idPrefix: string;
    }
);

/**
 * The resource of a node of a graph enriched with environment data, whose identifier is valid in the environment.
 */
export type GraphResolvedResource = Pick<GraphResource, 'type' | 'scope'> & {
  /**
   * The identifier of the resource for its provider.
   */
  readonly id: string;
};

/**
 * A part of a template: either a literal, or a reference to a configuration value.
 */
export type GraphTemplatePart = string | { readonly configuration: string };

/**
 * Builds a string from parts, referencing configuration values using Causa templates.
 * Literal parts cannot contain template syntax (`${` or `<%`), as it would be evaluated when rendering the string.
 *
 * @param parts The literal or configuration parts to concatenate.
 * @returns The string, e.g. `projects/${ configuration('myVar') }`.
 */
export function graphTemplate(...parts: GraphTemplatePart[]): string {
  return parts
    .map((p) => {
      if (typeof p !== 'string') {
        return `\${ configuration('${p.configuration}') }`;
      }

      if (/\$\{|<%/.test(p)) {
        throw new Error(
          `The literal '${p}' contains template syntax, which would be evaluated when rendering.`,
        );
      }

      return p;
    })
    .join('');
}

/**
 * Renders parts to a string, using the configuration of the given context for the configuration parts. Secrets are not
 * rendered.
 *
 * @param context The context whose configuration is used.
 * @param parts The literal or configuration parts to concatenate.
 * @returns The rendered string.
 */
export async function renderGraphTemplate(
  context: WorkspaceContext,
  ...parts: GraphTemplatePart[]
): Promise<string> {
  return await context.render(
    { $format: graphTemplate(...parts) },
    { renderSecrets: false },
  );
}
