import { panic, type Type } from 'quicktype-core';
import type { TypeGraph } from 'quicktype-core/dist/Type/index.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';

/**
 * Finds the URI for the given type, and optionally resolves a (relative) URI against it.
 * The returned string is a "normalized" URL with a scheme. The fragment is preserved only if it's not empty.
 *
 * @param type The type used as the origin for the URL.
 * @param relativeUri If passed, it is resolved against the type's URL and returned instead of the type's URL.
 * @returns The URL of the type or the `relativeUri` resolved against it, or `undefined` if the type does not define its
 *   URI.
 */
function resolveUrlForType(
  type: Type,
  relativeUri?: string,
): string | undefined {
  const typeUri = causaTypeAttributeKind.tryGetInAttributes(
    type.getAttributes(),
  )?.uri;
  if (!typeUri) {
    return undefined;
  }

  let url = new URL(typeUri, 'file://');

  if (relativeUri) {
    url = new URL(relativeUri, url);
  }

  // Ensures there's not trailing `#` when there is no fragment or when it's empty.
  if (!url.hash) {
    url.hash = '';
  }

  return url.toString();
}

/**
 * Finds the type for the given URI in the type graph.
 * The given `originType` is used as the based to resolve the URI.
 *
 * @param typeGraph The type graph containing all types.
 * @param originType The {@link Type} from which the type to find is referenced.
 * @param uri The (relative) URI of the type to find.
 * @returns The referenced type, or `undefined` if the type could not be found.
 */
export function findTypeForUri(
  typeGraph: TypeGraph,
  originType: Type,
  uri: string,
): Type | undefined {
  const resolvedUrl = resolveUrlForType(originType, uri);
  if (!resolvedUrl) {
    panic(
      'Cannot resolve URI to type for origin type without the Causa attribute.',
    );
  }

  let type: Type | undefined;
  typeGraph.allNamedTypes().forEach((t) => {
    if (!type && resolvedUrl === resolveUrlForType(t)) {
      type = t;
    }
  });

  return type;
}
