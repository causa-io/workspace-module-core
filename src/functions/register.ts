import { ModuleRegistrationContext } from '@causa/workspace';
import {
  EmulatorListForAll,
  EmulatorStartManyForAll,
  EmulatorStopManyForAll,
  SecretFetchForEnvironmentVariable,
} from './index.js';
import { ProjectPublishArtefactForAll } from './project-publish-artefact.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    ProjectPublishArtefactForAll,
    SecretFetchForEnvironmentVariable,
  );
}
