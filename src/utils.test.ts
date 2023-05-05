import {
  BaseConfiguration,
  ProcessorInstruction,
  WorkspaceContext,
  WorkspaceFunction,
} from '@causa/workspace';
import {
  ConfigurationReader,
  ConfigurationReaderSourceType,
} from '@causa/workspace/configuration';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import { resolve } from 'path';
import { Logger, pino } from 'pino';

export function createContext(
  options: {
    workingDirectory?: string;
    environment?: string | null;
    rootPath?: string;
    projectPath?: string | null;
    configuration?:
      | ConfigurationReader<BaseConfiguration>
      | Record<string, any>;
    logger?: Logger;
  } = {},
): {
  context: WorkspaceContext;
  configuration: ConfigurationReader<BaseConfiguration>;
  functionRegistry: FunctionRegistry<WorkspaceContext>;
  logger: Logger;
} {
  const workingDirectory = resolve(options.workingDirectory ?? process.cwd());
  const environment =
    options.environment !== undefined ? options.environment : null;
  const rootPath = resolve(options.rootPath ?? workingDirectory);
  const projectPath =
    options.projectPath !== undefined ? options.projectPath : workingDirectory;
  const configuration =
    options.configuration instanceof ConfigurationReader
      ? options.configuration
      : new ConfigurationReader<BaseConfiguration>([
          {
            configuration: options.configuration ?? {},
            source: 'causa.yaml',
            sourceType: ConfigurationReaderSourceType.File,
          },
        ]);
  const functionRegistry = new FunctionRegistry(WorkspaceFunction);
  const processors: ProcessorInstruction[] = [];
  const logger = options.logger ?? pino();
  const context = new (WorkspaceContext as any)(
    workingDirectory,
    environment,
    rootPath,
    projectPath,
    configuration,
    functionRegistry,
    processors,
    logger,
  );
  return { context, configuration, functionRegistry, logger };
}
