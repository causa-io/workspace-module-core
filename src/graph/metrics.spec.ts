import 'jest-extended';
import { sumGraphMetricMeasures } from './metrics.js';

describe('metrics', () => {
  describe('sumGraphMetricMeasures', () => {
    it('should throw when there are no values', () => {
      expect(() => sumGraphMetricMeasures([])).toThrow(
        'At least one value must be summed.',
      );
    });

    it('should sum numbers', () => {
      const actualSum = sumGraphMetricMeasures([1, 2.5, 3]);

      expect(actualSum).toEqual(6.5);
    });

    it('should merge distributions', () => {
      const actualSum = sumGraphMetricMeasures([
        { layout: 'latency', count: 2, mean: 10, buckets: { 1: 1, 2: 1 } },
        { layout: 'latency', count: 2, mean: 20, buckets: { 2: 1, 3: 1 } },
        { layout: 'latency', count: 0, buckets: {} },
      ]);

      expect(actualSum).toEqual({
        layout: 'latency',
        count: 4,
        mean: 15,
        buckets: { 1: 1, 2: 2, 3: 1 },
      });
    });

    it('should omit the mean of an empty distribution', () => {
      const actualSum = sumGraphMetricMeasures([
        { layout: 'latency', count: 0, buckets: {} },
      ]);

      expect(actualSum).toEqual({ layout: 'latency', count: 0, buckets: {} });
    });

    it('should throw when distributions use different layouts', () => {
      expect(() =>
        sumGraphMetricMeasures([
          { layout: 'latency', count: 1, mean: 1, buckets: { 1: 1 } },
          { layout: 'other', count: 1, mean: 1, buckets: { 1: 1 } },
        ]),
      ).toThrow(
        'Only numbers, or distributions using the same layout, can be summed.',
      );
    });

    it('should throw when mixing numbers and distributions', () => {
      expect(() =>
        sumGraphMetricMeasures([
          1,
          { layout: 'latency', count: 1, mean: 1, buckets: { 1: 1 } },
        ]),
      ).toThrow(
        'Only numbers, or distributions using the same layout, can be summed.',
      );
    });
  });
});
