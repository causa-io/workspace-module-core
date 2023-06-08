# `@causa/workspace-core` module

This repository contains the source code for the `@causa/workspace-core` Causa module. It provides the implementations of many `cs` commands. It also provides definitions for commands that are meant to be implemented by other modules, depending on the project types and/or languages. For more information about the Causa CLI `cs`, checkout [its repository](https://github.com/causa-io/cli).

## 🎉 Installation

Add `@causa/workspace-core` to your Causa configuration in `causa.modules`.

## 🔧 Configuration

Several configurations are defined in this module, first for some generic `project.type`s:

- `infrastructure` ([`InfrastructureConfiguration`](./src/configurations/infrastructure-project.ts)): Projects defining infrastructure as code.
- `serverlessFunctions` ([`ServerlessFunctionsConfiguration`](./src/configurations/infrastructure-project.ts)): Projects defining serverless functions, meant to be run on some `serverlessFunctions.platform` (e.g. AWS Lambda, Google Cloud Functions).
- `serviceContainer` ([`ServiceContainerConfiguration`](./src/configurations/service-container-project.ts)): Projects defining a service, meant to be run as a container on some `serviceContainer.platform` (e.g. Kubernetes, Cloud Run, AWS ECS).

This modules also exposes the [`DockerConfiguration`](./src/configurations/docker.ts), which is used by the `DockerService`, exposing usual Docker commands.

## ✨ Supported project types and commands

The core module defines and implements many base `cs` commands. As a Causa user, you may want to check the [CLI repository](https://github.com/causa-io/cli) instead. As a module developer, you may want to check the [definitions](./src/definitions/) and determine which ones are relevant to implement in your module.

### Commands

- `cs init`: Initializes the workspace. This is a no-op in most cases as the CLI takes care of bootstrapping the workspace before running. The core module does not provide any project-specific implementation.
- `cs emulators`: Provides the `list`, `start`, and `stop` commands. However no actual emulator is implemented by this module. Available emulators will depend on other loaded modules.
- `cs environment`: Provides the `prepare` and `deploy` commands, forwarding those infrastructure commands to the project configured in `infrastructure.environmentProject`.
- `cs events generateCode`: Lists the event topics used by the current project (based on its type) and triggers the generation of the corresponding types. The actual code generation depends on the programming language and should be implemented in the relevant modules.
- `cs infrastructure`: Provides the `prepare` and `deploy` commands. Those commands run "infrastructure processors" before the actual infrastructure operation, and tear those down afterwards. The core module does not implement actual infrastructure operations, which depend on the project's language, e.g. `terraform`.
- `cs publish`: While many base commands (e.g. `cs build`) are straightforward and should be implemented by the modules handling the corresponding project types and languages, `cs publish` provides some logic around these base commands to both build and push a project's artefact. The artefact is tagged according to the passed value or format, e.g. `my-custom-tag` or `semantic`. (The latter will use the project's version as the tag.)

### Secrets backend

The core module implements a very basic secrets backend: `environmentVariable`. As the name suggests, it retrieves values from the process environment:

```yaml
secrets:
  mySecret:
    backend: environmentVariable
    name: SOME_ENV_VAR
```

## 📚 Definitions

The core module provides many Causa workspace function definitions. Some of those definitions are exposed as `cs` commands and provides the base functionalities for a Causa workspace. Some of the function definitions are implemented "generically" in this module, while others are meant to be implemented by other Causa modules, providing support of a specific project language or type.

This section provides pointers for Causa module developers. Workspace function definitions can be found in the [`./src/definitions`](./src/definitions/) directory. Those include:

- [Emulators](./src/definitions/emulator.ts): Modules exposing local emulators (e.g. of databases) should implement both `EmulatorStart` and `EmulatorStop` for each of them.
- [Environment](./src/definitions/environment.ts): Functions mapping to `cs environment` commands. Those are not meant to be implemented by other modules.
- [Event topic](./src/definitions/event-topic.ts): Functions related to event topics and code generation. Modules providing support for a programming language should implement `EventTopicGenerateCode`. Modules providing support for a new project type should implement `EventTopicListReferencedInProject`.
- [Infrastructure](./src/definitions/infrastructure.ts): Modules providing support for an Infrastructure as Code tool (e.g. Terraform, Pulumi) should implement the `InfrastructurePrepare` and `InfrastructureDeploy` functions.
- [Project](./src/definitions/project.ts): Many of the definitions in this file should be implemented by modules providing support for a language and/or project type, e.g. `ProjectBuildArtefact`, `ProjectReadVersion`, `ProjectPushArtefact`, `ProjectGetArtefactDestination`.

## 🔨 Services

This module implements some [services](./src/services/) used by itself, but which might also come handy in other modules, namely:

- `ProcessService`: Provides a normalized way to spawn child processes.
- `GitService`: Runs `git` commands using the `ProcessService`.
- `DockerService`: Runs `docker` commands using the `ProcessService`.
- `DockerEmulatorService`: Provides a normalized way to starting and stopping containerized emulators. Also provides a way to wait for an emulator exposing an HTTP endpoint.
