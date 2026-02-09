import type { ModuleRegistrationContext } from '@causa/workspace';
import { CausaListConfigurationSchemasForCore } from './configuration/index.js';
import {
  EmulatorListForAll,
  EmulatorStartManyForAll,
  EmulatorStopManyForAll,
} from './emulator/index.js';
import {
  EnvironmentDeployForAll,
  EnvironmentPrepareForAll,
} from './environment/index.js';
import {
  EventTopicBackfillForAll,
  EventTopicCleanBackfillForAll,
  EventTopicListForAll,
  EventTopicListReferencedInProjectForServerlessFunctions,
  EventTopicListReferencedInProjectForServiceContainer,
} from './event-topic/index.js';
import {
  InfrastructureProcessAndDeployForAll,
  InfrastructureProcessAndPrepareForAll,
} from './infrastructure/index.js';
import {
  ModelGenerateCodeForAll,
  ModelMakeGeneratorQuicktypeInputDataForJsonSchema,
  ModelParseCodeGeneratorInputsForAll,
} from './model/index.js';
import {
  OpenApiGenerateSpecificationForProjectByMerging,
  OpenApiGenerateSpecificationForWorkspace,
} from './openapi/index.js';
import {
  ProjectDependenciesUpdateAndTestForAll,
  ProjectDiffForAll,
  ProjectInitForWorkspace,
  ProjectPublishArtefactForAll,
  ProjectPushArtefactForServiceContainer,
  ProjectWriteConfigurations,
} from './project/index.js';
import { SecretFetchForEnvironmentVariable } from './secret/index.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    CausaListConfigurationSchemasForCore,
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    EnvironmentDeployForAll,
    EnvironmentPrepareForAll,
    EventTopicBackfillForAll,
    EventTopicCleanBackfillForAll,
    EventTopicListReferencedInProjectForServerlessFunctions,
    EventTopicListReferencedInProjectForServiceContainer,
    EventTopicListForAll,
    InfrastructureProcessAndDeployForAll,
    InfrastructureProcessAndPrepareForAll,
    ModelGenerateCodeForAll,
    ModelMakeGeneratorQuicktypeInputDataForJsonSchema,
    ModelParseCodeGeneratorInputsForAll,
    OpenApiGenerateSpecificationForProjectByMerging,
    OpenApiGenerateSpecificationForWorkspace,
    ProjectDependenciesUpdateAndTestForAll,
    ProjectDiffForAll,
    ProjectInitForWorkspace,
    ProjectPublishArtefactForAll,
    ProjectPushArtefactForServiceContainer,
    ProjectWriteConfigurations,
    SecretFetchForEnvironmentVariable,
  );
}
