import type { ModuleRegistrationContext } from '@causa/workspace';
import {
  ConfigurationCheckForAll,
  CausaListConfigurationSchemasForCore,
} from './causa/index.js';
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
  EventTopicCreateBackfillSourceFromJsonFiles,
  EventTopicListForAll,
  EventTopicListReferencedInProjectForServerlessFunctions,
  EventTopicListReferencedInProjectForServiceContainer,
} from './event-topic/index.js';
import { MakeHttpRequestForAll } from './http/index.js';
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
import { ScenarioRunForAll } from './scenario/index.js';
import { SecretFetchForEnvironmentVariable } from './secret/index.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    ConfigurationCheckForAll,
    CausaListConfigurationSchemasForCore,
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    EnvironmentDeployForAll,
    EnvironmentPrepareForAll,
    EventTopicBackfillForAll,
    EventTopicCleanBackfillForAll,
    EventTopicCreateBackfillSourceFromJsonFiles,
    EventTopicListReferencedInProjectForServerlessFunctions,
    EventTopicListReferencedInProjectForServiceContainer,
    EventTopicListForAll,
    InfrastructureProcessAndDeployForAll,
    InfrastructureProcessAndPrepareForAll,
    MakeHttpRequestForAll,
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
    ScenarioRunForAll,
    SecretFetchForEnvironmentVariable,
  );
}
