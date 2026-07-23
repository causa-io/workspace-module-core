# 🔖 Changelog

## Unreleased

Features:

- Add the optional `id` property to `QueriedLogEntry` and `QueriedEvent`, a unique ID that is stable across queries when provided by the implementation.

## v1.2.1 (2026-06-29)

Fixes:

- Reset the OS-level sandbox after every command, fixing a hang on Linux where the CLI would never exit once a sandboxed command completed (the sandbox runtime's network bridges kept the process alive).

## v1.2.0 (2026-06-29)

Features:

- Add OS-level sandboxing for spawned processes, backed by `@anthropic-ai/sandbox-runtime`. Sandbox profiles are defined under `causa.sandboxes` and selected through the new `sandbox` option of `ProcessService.spawn` (also exposed by `GitService.git` and `DockerService.docker`).
- Add the `Timeline` type (along with its children), modelling a timeline view of one or several time-ordered sources. It is generated from a JSONSchema bundled in the package.
- Add the optional `timeline` reference to the scenario schema, pointing at a timeline definition to display while the scenario runs and after it completes.

## v1.1.0 (2026-06-11)

Features:

- Add the optional `dto` (a schema reference relative to the project's root) and `enabled` (a boolean defaulting to `true`, disabling deployment of the trigger when `false`) properties to generic service container triggers.

## v1.0.1 (2026-06-09)

Fixes:

- Allow the `entityPropertyChanges` Causa extension to be `*`, denoting that all entity properties may be changed by the mutation.

## v1.0.0 (2026-06-09)

This release includes all the changes from the `v0.35.0-beta.*` version.

Fixes:

- Close the backfill event source iterator once publishing is done even when the publisher fails before consuming it, never iterates it, or stops part-way.

## v0.35.0-beta.7 (2026-06-08)

Features:

- Add the `rand` function to scenario templates, generating a random UUID (`rand('uuid')`), integer (`rand('int', min, max)`), or floating-point number (`rand('float', min, max)`).
- Support `multipart/form-data` bodies in `HttpMakeRequest`: when the `Content-Type` header is `multipart/form-data`, the `body` object is sent as a form.
- JSON-serialize the `HttpMakeRequest` body (even when it is a string) when the `Content-Type` header is set to `application/json`.
- Recognize the `entityMutationFrom` (a list of schema references, possibly containing `null` entries) and `entityPropertyChanges` (a list of property names) Causa extensions during JSONSchema parsing. References in `entityMutationFrom` are normalized to absolute paths like other ref-bearing extensions.

Fixes:

- Detect scenario step dependencies across all `json-e` expression forms, including member access, indexing, builtins, both branches of `$if`/`$switch`, and multiple interpolations in a single string.
- Allow any JSON value (string, number, boolean, object, array, or null) as a scenario step expectation `value`.

## v0.35.0-beta.6 (2026-05-27)

Features:

- Support JSONSchema `anyOf` unions during parsing and writing.
- Support inline object, enum, and union schemas declared as variants of a `oneOf` or `anyOf`.

Chores:

- Update configuration schemas for compatibility with new code generation.

## v0.35.0-beta.5 (2026-05-26)

Breaking changes:

- `cs events backfill` no longer writes a backfill file when no temporary resources were created (e.g. no temporary topic and no triggers, or when the command fails before any temporary resource exists). In that case, the command returns an empty string instead of a path, and its output is suppressed.

Features:

- Add the `--autoClean` option to `cs events backfill`, which waits for events to be processed after publishing and runs `cleanBackfill` inline. Introduces the broker-side `EventTopicBrokerWaitForProcessing` workspace function, which implementations should provide to support `--autoClean`.
- Parse the `additionalProperties` declaration on object schemas during JSONSchema parsing, exposing it on `ObjectSchema.additionalProperties` as a boolean or a resolved `PropertyType` (with inline object, enum, and union shapes extracted as nested schemas, like map values).

## v0.35.0-beta.4 (2026-05-22)

Features:

- Support inline object, enum, and union schemas declared inside a property's `oneOf` (including the nullable wrapper), inside array `items`, and inside `additionalProperties` during JSONSchema parsing.
- Support `type` declared as an array (e.g. `[string, "null"]`, `[string, integer]`) during JSONSchema parsing, both as a nullable wrapper and as a shorthand for a union.
- Infer a schema name from the source path (filename, `$defs`/`definitions` key, or property name) when no `title` is provided during JSONSchema parsing.

Fixes:

- Ignore unsupported JSONSchema `format` values for primitive types rather than throwing, falling back to the bare type.
- Treat a missing `additionalProperties` as `true` (the JSONSchema default) when parsing maps, so that `{ type: object }` with no `properties` resolves to a map of any.

## v0.35.0-beta.3 (2026-05-21)

Features:

- Define the `serviceContainer.healthCheck` configuration for service containers, with `startup` and `liveness` probe blocks supporting `path`, `initialDelay`, `period`, `timeout`, and `failureThreshold`.

## v0.35.0-beta.2 (2026-05-21)

Breaking changes:

- Remove the `quicktype`-based code generation, including the `./code-generation` subpath export, the `MakeGeneratorQuicktypeInputData` workspace function, and the `quicktype-core` dependency.

Features:

- Export the `./jsonschema` subpath.

Chores:

- Remove the `axios` dependency in favor of the Node.js-provided `fetch`.

## v0.35.0-beta.1 (2026-05-18)

Breaking changes:

- Remove the `key` (ordering) property from `BackfillEvent`.

Features:

- Define the format-neutral schema model types (`Schema`, `ObjectSchema`, `EnumSchema`, `UnionSchema`, `Property`, `PropertyType`, `SchemaDatabase`, `CausaExtensions`, `InvalidSchemaError`).
- Define the `ModelSchemaParse`, `ModelSchemaExtractDatabase`, and `ModelSchemaWrite` workspace functions.
- Implement `ModelSchemaParse` and `ModelSchemaWrite` for JSONSchema.

Chores:

- Replace the `js-yaml` dependency with `yaml`.

## v0.34.0 (2026-05-04)

Breaking changes:

- Rename the `MakeHttpRequest` workspace function (and its `MakeHttpRequestForAll` implementation) to `HttpMakeRequest` (and `HttpMakeRequestForAll`).

Features:

- Add the `query` property to `HttpMakeRequest` to set query string parameters.
- Override the json-e `str` builtin to format `Date` values as ISO strings in scenario templates.
- Add the `after` property to scenario steps to declare explicit step dependencies without using `output()` templates.

## v0.33.0 (2026-04-29)

Features:

- Implement `ScenarioRun` for any context.
- Add the `MakeHttpRequest` workspace function.
- Define the `DatabaseQueryRecords`, `EventTopicQueryEvents`, and `ServiceContainerQueryLogs` workspace functions, to be implemented by other modules.

## v0.32.0 (2026-04-21)

Breaking changes:

- Default to the workspace or project directory when writing OpenAPI specs.
- Default the `events backfill` output file to the workspace root instead of the current working directory.
- Support a new project-scoped trigger format `<projectPath>#<triggerName>[?<options>]` in `events backfill`. When a trigger matches, the workspace context is cloned for the referenced project and `EventTopicBrokerCreateTrigger` is called with a structured `{ name, options }` payload.
- Replace the `BackfillEventsSource` / `BackfillEventPublisher` / `JsonFilesEventSource` abstractions with an async-iterable-based contract. Introduce the `EventTopicCreateBackfillSource` workspace function (with a `json://<glob>` implementation) to build the `AsyncIterable<BackfillEvent>` consumed by `EventTopicBrokerPublishEvents`. Remove the `./backfill` package subpath export.

## v0.31.0 (2026-04-20)

Features:

- Add the `description` property to `serviceContainer.trigger`.

## v0.30.0 (2026-04-13)

Breaking changes:

- Remove support for Node.js 20.

Features:

- Add the `$id` to the generated configuration schema file.
- Define the `model.globs` configuration.

## v0.29.0 (2026-03-24)

Features:

- Add the `configuration check` command, validating the workspace configuration against the combined JSON Schema from all modules.
  - `--render` renders templates (without secrets) before validating.
  - `--projects` validates the configuration for each project in the workspace.

## v0.28.1 (2026-03-13)

Chores:

- Upgrade dependencies.

## v0.28.0 (2026-02-11)

Features:

- Refine configuration schemas with known `project.type` values and `infrastructure.processors`.

## v0.27.0 (2026-02-11)

Same as release candidates.

## v0.27.0-rc.2 (2026-02-10)

Features:

- Define the environment configuration schema when initializing the workspace.

## v0.27.0-rc.1 (2026-02-10)

Breaking changes:

- Move backfill, code generation, and services as separate exports.
- Add the `--workspace` option to `ProjectInit` (`cs init`), to allow initializing the workspace in a single-project workspace.

Features:

- Export `makeJsonSchemaInputDataFromSources`.
- Create the `.causa/configuration-schema.yaml` JSONSchema file during the workspace's `ProjectInit` (`cs init`), providing the complete schema for Causa configuration files.

Chores:

- Defer loading of heavy dependencies (`quicktype-core`, `@scalar/*`) during function registration.
- Define JSONSchemas for configurations.

## v0.26.1 (2026-02-06)

Chore:

- Upgrade dependencies.

## v0.26.0 (2026-01-28)

Features:

- Implement `OpenApiGenerateSpecification` for generic projects by merging several specification files matched by `openApi.specifications` globs.
- Deduplicate `components` across projects when merging workspace-level OpenAPI specifications.
- Bundle external `$ref` references into a single self-contained file for workspace-level OpenAPI generation.
- Add `--version` CLI option to `OpenApiGenerateSpecification` to set `info.version` in the generated specification.

## v0.25.2 (2026-01-14)

Chore:

- Upgrade dependencies.

## v0.25.1 (2025-11-24)

Fixes:

- Support production of attributes for JSONSchema combined types.

## v0.25.0 (2025-10-29)

Breaking changes:

- Do not write secrets to files in the `ProjectWriteConfigurations` infrastructure processor.

## v0.24.1 (2025-10-20)

Chore:

- Upgrade dependencies.

## v0.24.0 (2025-08-08)

Features:

- Add `pull` option to `DockerService.run()` method supporting `'always'`, `'missing'`, and `'never'` values.
- Update `DockerEmulatorService` to use `pull: 'always'` by default for emulator containers.

## v0.23.0 (2025-08-05)

Breaking changes:

- Upgrade the minimum Node.js version to `20`.
- Return lists of `EventTopicDefinition`s in `EventTopicListReferencedInProject` rather than IDs.
- Remove code generation features from event topic-related functions and commands.

Features:

- Provide `generateCodeForSchemas` and `makeJsonSchemaInputData` as utilities for future code generators.
- Implement the `findTypeForUri` `quicktype` utility.
- Define the `ModelGenerateCode` (including implementation) and `ModelRunCodeGenerator` workspace functions.
- Define the `ModelConfiguration`.
- Define and provide additional properties in `CausaAttribute` to enable new features in code generators.
- Implement the `ModelParseCodeGeneratorInputs` workspace function.
- Define the `ModelMakeGeneratorQuicktypeInputData` workspace function and implement it for JSONSchema.
- Allow configuration templates in serverless functions and service container triggers definitions.

## v0.22.3 (2025-05-12)

Chore:

- Adapt to `quicktype` breaking changes.

## v0.22.2 (2025-03-17)

Chore:

- Upgrade dependencies.

## v0.22.1 (2024-10-09)

Fixes:

- Fix `outputFn` in commands that would log the arguments to the output.

## v0.22.0 (2024-10-07)

Breaking change:

- Change `GitService.diff` option to `commits`, to explicitly handle several commits.

Features:

- Implement `GitService.getRepositoryRootPath`.
- Define `ProjectDiff` and implement it for any projects and workspace.

## v0.21.0 (2024-05-27)

Breaking change:

- Ignore symbolic links in the `JsonFilesEventSource`.

## v0.20.0 (2024-05-17)

Breaking change:

- Drop support for Node.js 16.

Chore:

- Upgrade dependencies.

## v0.19.1 (2023-11-02)

Fixes:

- Handle Causa attributes being combined with a null type during JSONSchema-based code generation.

## v0.19.0 (2023-10-31)

Breaking changes:

- Language-specific modules are no longer expected to implement `EventTopicGenerateCode` directly, at least for JSONSchema topic definitions. `EventTopicGenerateCode` is now implemented by this module using [quicktype](https://github.com/glideapps/quicktype). Language modules should implement `EventTopicMakeCodeGenerationTargetLanguage` instead and return a quicktype `TargetLanguage`.

Features:

- Implement and expose [quicktype-related utilities](./src/code-generation/), meant to be used by language-specific Causa modules for code generation.

Chores:

- Organize function implementations into subfolders.

## v0.18.0 (2023-10-03)

Features:

- Allow specifying a prefix for the tag passed to `ProjectPublishArtefact` (`--tagPrefix` when using the CLI).

## v0.17.0 (2023-10-03)

Features:

- Define the `serviceContainer.buildFile` and `serviceContainer.buildSecrets` configuration parameters.
- Implement the `ServiceContainerBuilderService`.

## v0.16.0 (2023-09-18)

Features:

- Support overriding the OpenAPI version in the `openApi.global` document.
- Support generating the list of OpenAPI servers from the list of environments.

## v0.15.0 (2023-09-15)

Features:

- Define the `OpenApiGenerateSpecification` workspace function (`cs openapi genSpec`) and provide its workspace-level implementation, which merges all OpenAPI specifications in a single file.
- Support the `envFile` options for `DockerService.run`.
- Log the emulators configuration after starting them using `cs emulators start`.
- Suggest an authorization issue when failing to push a Docker image for a service container.

## v0.14.1 (2023-08-04)

Fixes:

- Make the backfill command in the logs reflect the selected environment (e.g. `cs events cleanBackfill -e dev "file.json"`).

## v0.14.0 (2023-08-04)

Features:

- Define and implement backfilling utilities: `BackfillEvent`, `BackfillEventsSource`, `BackfillEventPublisher`, and `JsonFilesEventSource`.

Fixes:

- Add missing decorators on `EventTopicBackfill.output` argument.

## v0.13.0 (2023-08-03)

Features:

- Define backfill-related workspace functions: `EventTopicBackfill`, `EventTopicCleanBackfill`, `EventTopicBrokerCreateTopic`, `EventTopicBrokerGetTopicId`, `EventTopicBrokerCreateTrigger`, `EventTopicBrokerPublishEvents`, `EventTopicBrokerDeleteTriggerResource`, and `EventTopicBrokerDeleteTopic`.
- Implement `EventTopicBackfill` and `EventTopicCleanBackfill` for any context.

## v0.12.0 (2023-08-01)

Breaking changes:

- `ProjectDependenciesUpdate` should now return a boolean indicating whether at least one dependency was updated.
- Make `GitService.diff` accept spawn options and return a process result.

Features:

- Do not run tests again if no dependency was updated.

## v0.11.0 (2023-07-31)

Features:

- Implement `ProjectDependenciesUpdateAndTest` for all types of projects.

## v0.10.0 (2023-07-31)

Features:

- Define the `--destroy` option for the `infrastructure` and `environment prepare` commands.
- Define the `ProjectDependenciesUpdate` and `ProjectDependenciesUpdateAndTest` functions, which define the `dependencies update` command.
- Implement the `diff` and `filesDiff` method of the `GitService`.

## v0.9.0 (2023-07-28)

Features:

- Define the `EventsConfiguration`, and add new fields to `ServiceContainerConfiguration`.

Fixes:

- Ensure the project configurations directory is emptied before writing configurations.

## v0.8.0 (2023-07-24)

Features:

- Implement the `ProjectWriteConfigurations` infrastructure processor.

## v0.7.0 (2023-06-08)

Features:

- Define the `ProjectInit`, `ProjectTest`, `ProjectLint`, `ProjectDependenciesCheck`, and `ProjectSecurityCheck` workspace functions.
- Implement `ProjectInit` for Causa workspaces.

## v0.6.0 (2023-06-01)

Features:

- Define the `serverlessFunctions.build.globPatterns` configuration.

## v0.5.0 (2023-05-31)

Features:

- Implement `EventTopicListReferencedInProject` for `serverlessFunctions` projects.

Fixes:

- Ensure there is no duplicate in the events returned by `EventTopicListReferencedInProjectForServiceContainer`.

## v0.4.0 (2023-05-23)

Features:

- Expose `DockerContainerMount` and `DockerContainerPublish` types for the `DockerService`.
- Implement the `DockerEmulatorService`.

## v0.3.0 (2023-05-19)

Breaking changes:

- Upgrade to `@causa/workspace >= 0.6.0`.

## v0.2.0 (2023-05-19)

Breaking changes:

- The `InfrastructureProcessor` now extends the generic `ProcessorFunction`. This means the processors should return a value containing a `configuration` property, rather than the configuration itself.

## v0.1.0 (2023-05-17)

Features:

- Expose `WorkspaceFunction` definitions.
- Expose base configuration types.
- Implement the `ProcessService`.
- Implement the `GitService`.
- Implement the `DockerService`.
- Implement the `SecretFetchForEnvironmentVariable` workspace function.
- Implement the `EmulatorListForAll`, `EmulatorStartManyForAll`, and `EmulatorStopManyForAll` functions.
- Implement the `ProjectPublishArtefactForAll` and `ProjectPushArtefactForServiceContainer` functions.
- Implement the `EnvironmentDeployForAll` and `EnvironmentPrepareForAll` functions.
- Implement the `InfrastructureProcessAndPrepareForAll` and `InfrastructureProcessAndDeployForAll` functions.
- Implement the `EventTopicGenerateCodeReferencedInProjectForAll`, `EventTopicListReferencedInProjectForServiceContainer`, and `EventTopicListForAll` functions.
