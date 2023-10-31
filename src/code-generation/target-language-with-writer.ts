import { TargetLanguage } from 'quicktype-core';

/**
 * A quicktype {@link TargetLanguage} that also handles writing the output source code to a file.
 */
export interface TargetLanguageWithWriter extends TargetLanguage {
  /**
   * Writes the given source code to the configured file for the language.
   *
   * @param source The source code returned by quicktype to write.
   */
  writeFile(source: string): Promise<void>;
}
