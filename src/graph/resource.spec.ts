import { TemplateRenderingError } from '@causa/workspace/configuration';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { pino } from 'pino';
import { graphTemplate, renderGraphTemplate } from './resource.js';

describe('resource', () => {
  const { context } = createContext({
    configuration: {
      workspace: { name: 'shop' },
      google: {
        project: 'my-project',
        region: { $format: "${ configuration('zone') }" },
      },
      zone: 'europe-west1',
    },
    logger: pino({ level: 'silent' }),
  });

  describe('graphTemplate', () => {
    it('should reference the configuration in Causa templates', () => {
      const actualTemplate = graphTemplate(
        'projects/',
        { configuration: 'google.project' },
        '/topics/orders',
      );

      expect(actualTemplate).toEqual(
        "projects/${ configuration('google.project') }/topics/orders",
      );
    });

    it.each(['${ 1 + 1 }', '<%= 1 + 1 %>'])(
      'should throw when a literal contains template syntax: %s',
      (literal) => {
        expect(() => graphTemplate('projects/', literal)).toThrow(
          `The literal '${literal}' contains template syntax, which would be evaluated when rendering.`,
        );
      },
    );
  });

  describe('renderGraphTemplate', () => {
    it('should render the configuration parts', async () => {
      const actualId = await renderGraphTemplate(
        context,
        'projects/',
        { configuration: 'google.project' },
        '/locations/',
        { configuration: 'google.region' },
      );

      expect(actualId).toEqual('projects/my-project/locations/europe-west1');
    });

    it('should throw when a configuration value is not set', async () => {
      const actualPromise = renderGraphTemplate(context, {
        configuration: 'google.missing',
      });

      await expect(actualPromise).rejects.toThrow(TemplateRenderingError);
    });
  });
});
