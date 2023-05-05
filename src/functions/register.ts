import { ModuleRegistrationContext } from '@causa/workspace';
import {
  EmulatorListForAll,
  EmulatorStartManyForAll,
  EmulatorStopManyForAll,
  SecretFetchForEnvironmentVariable,
} from './index.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    SecretFetchForEnvironmentVariable,
  );
}
