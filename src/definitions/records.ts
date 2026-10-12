/**
 * A condition on a value in a record, i.e. a database row or document, or an event.
 */
export type RecordCondition =
  | {
      /**
       * The names of the properties leading to the value, from the root of the record.
       */
      readonly path: string[];

      /**
       * Requires the value to be equal to {@link RecordCondition.value}.
       */
      readonly operator: 'equals';

      /**
       * The value to which the value in the record should be equal.
       */
      readonly value: string | number | boolean;
    }
  | {
      /**
       * The names of the properties leading to the value, from the root of the record.
       */
      readonly path: string[];

      /**
       * `isNull` requires the value to be `null` or absent, and `isNotNull` requires it to be present and not `null`.
       */
      readonly operator: 'isNull' | 'isNotNull';
    };

/**
 * Filters on records, keyed by name.
 * A record matches a filter when it satisfies all of its conditions. A filter without conditions matches all records.
 */
export type RecordFilters = Record<string, RecordCondition[]>;

/**
 * The number of records, and the number of those matching each filter.
 */
export type RecordCounts = {
  /**
   * The total number of records.
   */
  readonly total: number;

  /**
   * The number of records matching each filter, keyed by the name of the filter.
   */
  readonly counts: Record<string, number>;
};
