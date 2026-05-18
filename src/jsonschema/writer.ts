import { dirname, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as yaml from 'yaml';
import {
  REF_BEARING_CAUSA_EXTENSIONS,
  type CausaExtensions,
  type EnumSchema,
  type ObjectSchema,
  type PrimitiveType,
  type Property,
  type PropertyType,
  type Schema,
  type UnionSchema,
} from '../definitions/index.js';

/**
 * JSON Schema type keywords: YAML keys that determine the kind / structure of a schema or property. Any of these that
 * the new shape does not keep is cleared before writing to avoid leaving stale leftovers from a previous shape (e.g.
 * an `enum` array on a node now being written as a `type: object`).
 */
const TYPE_KEYWORDS = [
  'type',
  'format',
  'oneOf',
  'items',
  '$ref',
  'enum',
  'const',
  'additionalProperties',
  'properties',
  'required',
];

/**
 * Return the {@link TYPE_KEYWORDS} that are not in `kept`. Use to declare which type keywords an `apply*` function
 * does NOT own (and therefore should be cleared before its own keys are written).
 *
 * @param kept Keywords the caller intends to set or preserve.
 * @returns Keywords to delete from the node before applying the new shape.
 */
function excludeTypeKeywordsExcept(...kept: string[]): string[] {
  return TYPE_KEYWORDS.filter((k) => !kept.includes(k));
}

/**
 * Apply `schema` to `contents`, returning the new file text.
 *
 * The target node is located via {@link Schema.path}: bare paths address the root document, fragmented paths address
 * nested definitions (e.g. `#/$defs/Foo`). Missing intermediate containers are created. References stored as absolute
 * paths on the schema are rewritten relative to the containing file on output. Top-level writes leave existing
 * siblings (notably `$defs` / `definitions`) untouched.
 *
 * @param contents Current text of the file. May be empty when creating a new file.
 * @param schema The schema to write.
 * @returns The new file text.
 */
export function apply(contents: string, schema: Schema): string {
  const doc = contents
    ? yaml.parseDocument(contents)
    : new yaml.Document(new yaml.YAMLMap());
  if (!doc.contents || !yaml.isMap(doc.contents)) {
    doc.contents = new yaml.YAMLMap();
  }

  const [filePath, fragment = ''] = schema.path.split('#');
  const node = ensureNode(doc.contents as yaml.YAMLMap, fragment);
  applySchemaBody(node, schema, filePath);

  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/**
 * Delete the schema at `path` from `contents`.
 *
 * Removes the entry from its parent container and, when the container is left empty, removes the container itself.
 * Top-level paths (no `#`-fragment) are a no-op.
 *
 * @param contents Current text of the file.
 * @param path Absolute path of the schema to delete.
 * @returns The new file text.
 */
export function remove(contents: string, path: string): string {
  const doc = yaml.parseDocument(contents);
  if (!doc.contents || !yaml.isMap(doc.contents)) {
    return contents;
  }

  const [, fragment] = path.split('#');
  if (fragment === undefined) {
    return contents;
  }
  const segments = fragment.split('/').filter(Boolean);
  if (segments.length === 0) {
    return contents;
  }

  const leafKey = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const parent = getNode(doc.contents, parentSegments);
  if (!parent || !parent.get(leafKey)) {
    return contents;
  }

  parent.delete(leafKey);

  pruneEmptyAncestors(doc.contents, parentSegments);

  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/**
 * Move a nested schema from `oldFragment` to `newFragment` inside the same file.
 *
 * Updates the parent key, sets `title` on the renamed node, and rewrites every in-file scalar that contains the old
 * fragment so local `$ref`s follow.
 *
 * @param contents Current text of the file.
 * @param oldFragment The old JSON Pointer fragment, e.g. `#/$defs/Foo`.
 * @param newFragment The new JSON Pointer fragment, e.g. `#/$defs/Bar`.
 * @returns The new file text.
 */
export function rename(
  contents: string,
  oldFragment: string,
  newFragment: string,
): string {
  const doc = yaml.parseDocument(contents);
  if (!doc.contents || !yaml.isMap(doc.contents)) {
    return contents;
  }

  const oldSegments = oldFragment.split('/').filter(Boolean);
  const newSegments = newFragment.split('/').filter(Boolean);
  if (oldSegments.length === 0 || newSegments.length === 0) {
    return contents;
  }

  const oldLeaf = oldSegments[oldSegments.length - 1];
  const newLeaf = newSegments[newSegments.length - 1];
  const oldParentSegments = oldSegments.slice(0, -1);
  const newParentSegments = newSegments.slice(0, -1);
  const oldParent = getNode(doc.contents, oldParentSegments);
  if (!oldParent || !oldParent.get(oldLeaf)) {
    return contents;
  }

  const items = oldParent.items as yaml.Pair[];
  const oldIndex = items.findIndex(
    (p) => yaml.isScalar(p.key) && p.key.value === oldLeaf,
  );
  const movedNode = items[oldIndex].value;
  items.splice(oldIndex, 1);

  const newParent = ensureNode(doc.contents, newParentSegments.join('/'));
  const newPair = new yaml.Pair(newLeaf, movedNode);
  if (newParent === oldParent) {
    newParent.items.splice(oldIndex, 0, newPair);
  } else {
    newParent.items.push(newPair);

    pruneEmptyAncestors(doc.contents, oldParentSegments);
  }

  if (yaml.isMap(movedNode)) {
    movedNode.set('title', newLeaf);
  }

  const normalizedOld = `#/${oldSegments.join('/')}`;
  const normalizedNew = `#/${newSegments.join('/')}`;
  yaml.visit(doc, {
    Scalar(_key, node) {
      if (
        typeof node.value === 'string' &&
        node.value.includes(normalizedOld)
      ) {
        node.value = node.value.replace(normalizedOld, normalizedNew);
      }
    },
  });

  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/**
 * Navigate to the node identified by the fragment, creating intermediate map containers along the way.
 *
 * @param root The root document map.
 * @param fragment The JSON Pointer fragment to navigate, without the leading `#`.
 * @returns The target map node.
 */
function ensureNode(root: yaml.YAMLMap, fragment: string): yaml.YAMLMap {
  const segments = fragment.split('/').filter(Boolean);
  let cursor: yaml.YAMLMap = root;
  for (const segment of segments) {
    const next = cursor.get(segment);
    if (yaml.isMap(next)) {
      cursor = next;
    } else {
      const newNode = new yaml.YAMLMap();
      newNode.flow = false;
      cursor.set(segment, newNode);
      cursor = newNode;
    }
  }
  return cursor;
}

/**
 * Resolve a sequence of map keys to its target node.
 *
 * @param root The root document map.
 * @param segments Map keys to walk in order.
 * @returns The target node, or `undefined` if any segment is missing.
 */
function getNode(
  root: yaml.YAMLMap,
  segments: string[],
): yaml.YAMLMap | undefined {
  let cursor = root;
  for (const segment of segments) {
    const next = cursor.get(segment);
    if (!yaml.isMap(next)) {
      return undefined;
    }
    cursor = next;
  }
  return cursor;
}

/**
 * Walk up the chain from the node at `segments` removing it from its parent as long as it is empty.
 *
 * @param root The root document map.
 * @param segments The map keys leading from `root` to the deepest ancestor to consider.
 */
function pruneEmptyAncestors(root: yaml.YAMLMap, segments: string[]): void {
  const chain = [...segments];
  let current = getNode(root, chain);
  while (current?.items.length === 0 && chain.length > 0) {
    const key = chain.pop()!;
    current = getNode(root, chain);
    current?.delete(key);
  }
}

/**
 * Dispatch on `schema.kind` to populate the target node with the schema's body.
 *
 * @param node The target node to populate.
 * @param schema The schema to apply.
 * @param filePath Absolute path of the containing file, used to rewrite refs to relative form.
 */
function applySchemaBody(
  node: yaml.YAMLMap,
  schema: Schema,
  filePath: string,
): void {
  switch (schema.kind) {
    case 'object':
      applyObject(node, schema, filePath);
      return;
    case 'enum':
      applyEnum(node, schema);
      return;
    case 'union':
      applyUnion(node, schema, filePath);
      return;
  }
}

/**
 * Apply an object schema's metadata, properties, and required set.
 *
 * @param node The target node.
 * @param schema The object schema to apply.
 * @param filePath Absolute path of the containing file.
 */
function applyObject(
  node: yaml.YAMLMap,
  schema: ObjectSchema,
  filePath: string,
): void {
  const target = {
    title: schema.name,
    type: 'object',
    additionalProperties: false,
  };
  applyMinimalChange(
    node,
    target,
    excludeTypeKeywordsExcept(
      'type',
      'additionalProperties',
      'properties',
      'required',
    ),
  );

  applyDescription(node, schema.description);
  applyExtensions(node, schema.extensions, filePath);
  applyProperties(node, schema.properties, filePath);
  applyRequired(
    node,
    schema.properties.filter((p) => p.required).map((p) => p.name),
  );
}

/**
 * Apply an enum schema's values and metadata.
 *
 * @param node The target node.
 * @param schema The enum schema to apply.
 */
function applyEnum(node: yaml.YAMLMap, schema: EnumSchema): void {
  const target: Record<string, unknown> = {
    title: schema.name,
    type: schema.type,
    enum: [...schema.values],
  };
  applyMinimalChange(node, target, excludeTypeKeywordsExcept('type', 'enum'));
  applyDescription(node, schema.description);
  applyExtensions(node, schema.extensions, '');
}

/**
 * Apply a union schema's `oneOf` members and metadata.
 *
 * @param node The target node.
 * @param schema The union schema to apply.
 * @param filePath Absolute path of the containing file.
 */
function applyUnion(
  node: yaml.YAMLMap,
  schema: UnionSchema,
  filePath: string,
): void {
  const target: Record<string, unknown> = {
    title: schema.name,
    oneOf: schema.types.map((t) => buildTypeNode(t, filePath)),
  };
  applyMinimalChange(node, target, excludeTypeKeywordsExcept('oneOf'));
  applyDescription(node, schema.description);
  applyExtensions(node, schema.extensions, filePath);
}

/**
 * Set or remove the `description` key based on the schema field.
 *
 * @param node The target node.
 * @param description The description value, or `undefined` to remove the key.
 */
function applyDescription(
  node: yaml.YAMLMap,
  description: string | undefined,
): void {
  if (description === undefined || description === '') {
    node.delete('description');
  } else if (node.get('description') !== description) {
    node.set('description', description);
  }
}

/**
 * Apply the `causa` block from `extensions`, rewriting ref-bearing values back to relative form. An empty bag removes
 * the block.
 *
 * @param node The target node.
 * @param extensions The causa extensions to apply.
 * @param filePath Absolute path of the containing file. May be empty to skip ref rewriting.
 */
function applyExtensions(
  node: yaml.YAMLMap,
  extensions: CausaExtensions,
  filePath: string,
): void {
  const entries = Object.entries(extensions);
  if (entries.length === 0) {
    node.delete('causa');
    return;
  }

  const value = Object.fromEntries(
    entries.map(([key, val]) => [
      key,
      REF_BEARING_CAUSA_EXTENSIONS.includes(key) && typeof val === 'string'
        ? toRelativeRef(val, filePath)
        : val,
    ]),
  );

  applyMinimalChange(node, { causa: value });
}

/**
 * Reconcile the YAML `properties` map with the schema's property list.
 *
 * The output order matches `properties`; properties missing from the list are removed.
 *
 * @param node The target object node.
 * @param properties The schema's property list.
 * @param filePath Absolute path of the containing file.
 */
function applyProperties(
  node: yaml.YAMLMap,
  properties: Property[],
  filePath: string,
): void {
  let propsNode = node.get('properties') as yaml.YAMLMap | undefined;
  if (!yaml.isMap(propsNode)) {
    propsNode = new yaml.YAMLMap();
    node.set('properties', propsNode);
  }

  propsNode.flow = properties.length === 0;

  propsNode.items = properties.map((property) => {
    let pair = propsNode.items.find(
      (p) => yaml.isScalar(p.key) && p.key.value === property.name,
    );
    if (!pair) {
      const fresh = new yaml.YAMLMap();
      fresh.flow = false;
      pair = new yaml.Pair(property.name, fresh);
    }
    applyPropertyNode(pair.value as yaml.YAMLMap, property, filePath);
    return pair;
  });
}

/**
 * Populate a property's YAML map from the parsed model.
 *
 * @param node The target property node.
 * @param property The parsed property.
 * @param filePath Absolute path of the containing file.
 */
function applyPropertyNode(
  node: yaml.YAMLMap,
  property: Property,
  filePath: string,
): void {
  const { target, exclude } = buildPropertyTarget(
    property.type,
    property.nullable,
    filePath,
  );
  applyMinimalChange(node, target, exclude);
  applyDescription(node, property.description);
  applyExtensions(node, property.extensions, filePath);
}

/**
 * Replace the `required` array with the new set, deleting it when empty.
 *
 * @param node The target object node.
 * @param required The new required property names.
 */
function applyRequired(node: yaml.YAMLMap, required: string[]): void {
  if (required.length === 0) {
    node.delete('required');
    return;
  }

  applyMinimalChange(node, { required });
}

/**
 * Build the YAML representation of a property's type + nullable combo, plus the list of type-related keys that should
 * be cleared because they're incompatible with the new shape.
 *
 * @param type The property type.
 * @param nullable Whether the property accepts `null`.
 * @param filePath Absolute path of the containing file.
 * @returns The YAML target object and the keys to clear.
 */
function buildPropertyTarget(
  type: PropertyType,
  nullable: boolean,
  filePath: string,
): { target: Record<string, unknown>; exclude: string[] } {
  const node = buildTypeNode(type, filePath);

  const target: Record<string, unknown> = {};
  if (nullable || type.kind === 'ref') {
    const variants = [node];
    if (nullable) {
      variants.push({ type: 'null' });
    }
    target.oneOf = variants;
  } else {
    Object.assign(target, node);
  }

  const exclude = excludeTypeKeywordsExcept(...Object.keys(target));
  return { target, exclude };
}

/**
 * Build the YAML payload for a single {@link PropertyType}.
 *
 * @param type The property type.
 * @param filePath Absolute path of the containing file.
 * @returns The YAML object representing this type.
 */
function buildTypeNode(
  type: PropertyType,
  filePath: string,
): Record<string, unknown> {
  switch (type.kind) {
    case 'null':
      return { type: 'null' };
    case 'primitive':
      return toJsonSchemaType(type.type);
    case 'const':
      return { const: type.value, ...toJsonSchemaType(type.type) };
    case 'ref':
      return { $ref: toRelativeRef(type.ref, filePath) };
    case 'array': {
      const itemType = buildTypeNode(type.items, filePath);
      const items = type.itemNullable
        ? { oneOf: [itemType, { type: 'null' }] }
        : itemType;
      return { type: 'array', items };
    }
    case 'map': {
      const additionalProperties =
        type.items === 'any' ? true : buildTypeNode(type.items, filePath);
      return { type: 'object', additionalProperties };
    }
  }
}

/**
 * Set keys from `target` onto `node` only where the values differ, preserving formatting for unchanged keys.
 *
 * Keys in `exclude` are removed first.
 *
 * @param node The target node.
 * @param target The keys and values to apply.
 * @param exclude Keys to remove before applying.
 */
function applyMinimalChange(
  node: yaml.YAMLMap,
  target: Record<string, unknown>,
  exclude: string[] = [],
): void {
  for (const key of exclude) {
    node.delete(key);
  }

  const current = node.toJSON();
  for (const [key, value] of Object.entries(target)) {
    if (!isDeepStrictEqual(current?.[key], value)) {
      node.set(key, value);
    }
  }
}

/**
 * Map a {@link PrimitiveType} to its JSON Schema `type` (and `format`, when the primitive carries one).
 *
 * @param type The primitive type.
 * @returns The JSON Schema type object.
 */
function toJsonSchemaType(type: PrimitiveType): {
  type: string;
  format?: string;
} {
  switch (type) {
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    default:
      return { type };
  }
}

/**
 * Convert an absolute schema path to a `$ref`-shaped string relative to the containing file (fragment-only when
 * same-file, relative path + fragment otherwise).
 *
 * @param targetPath Absolute path of the target schema.
 * @param currentFsPath Absolute path of the file containing the ref.
 * @returns The relative `$ref` string.
 */
function toRelativeRef(targetPath: string, currentFsPath: string): string {
  const [targetBase, rawFragment] = targetPath.split('#');
  const fragment = rawFragment === undefined ? '' : `#${rawFragment}`;

  if (!currentFsPath || targetBase === currentFsPath) {
    return fragment || '#';
  }

  const currentDir = dirname(currentFsPath);
  const relativePath = relative(currentDir, targetBase);
  return `${relativePath.split(sep).join('/')}${fragment}`;
}
