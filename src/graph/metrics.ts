import {
  GraphMetricKind,
  type GraphDistribution,
  type GraphMetricDefinition,
  type GraphMetricDefinitionsByType,
  type GraphMetricMeasure,
} from '../definitions/index.js';

const CODE_KEY = {
  code: 'The response code or class, as returned by the provider.',
};

const NODE_KEY = {
  node: 'The ID of the node of the graph the requests were routed to.',
};

const rate = (
  name: string,
  unit: string,
  description: string,
  groupBy?: Record<string, string>,
): GraphMetricDefinition => ({
  name,
  description,
  kind: GraphMetricKind.Rate,
  unit,
  ...(groupBy ? { groupBy } : {}),
});

const gauge = (
  name: string,
  unit: string,
  description: string,
  groupBy?: Record<string, string>,
): GraphMetricDefinition => ({
  name,
  description,
  kind: GraphMetricKind.Gauge,
  unit,
  ...(groupBy ? { groupBy } : {}),
});

const distribution = (
  name: string,
  unit: string,
  description: string,
  groupBy?: Record<string, string>,
): GraphMetricDefinition => ({
  name,
  description,
  kind: GraphMetricKind.Distribution,
  unit,
  ...(groupBy ? { groupBy } : {}),
});

/**
 * The definitions of the metrics of the core node types.
 */
export const CORE_GRAPH_METRIC_DEFINITIONS: GraphMetricDefinitionsByType = {
  service: {
    requests: rate(
      'Requests',
      '{request}/s',
      "Requests reaching the service's instances.",
      CODE_KEY,
    ),
    latency: distribution(
      'Latency',
      'ms',
      'Time from a request reaching an instance to its response, excluding the time to start the instance.',
      CODE_KEY,
    ),
    instances: gauge('Instances', '{instance}', 'Active instances.'),
    cpuUtilization: distribution(
      'CPU utilization',
      '%',
      'CPU utilization across instances.',
    ),
    memoryUtilization: distribution(
      'Memory utilization',
      '%',
      'Memory utilization across instances.',
    ),
    concurrency: distribution(
      'Concurrency',
      '{request}',
      'Maximum number of concurrent requests per instance.',
    ),
    errorLogs: rate(
      'Error logs',
      '{entry}/s',
      'Log entries with a severity of error or above.',
    ),
  },
  apiRouter: {
    requests: rate(
      'Requests',
      '{request}/s',
      'Requests served by the router, including those matching no route.',
      { ...CODE_KEY, ...NODE_KEY },
    ),
    latency: distribution(
      'Latency',
      'ms',
      'Latency seen by clients, until the last byte of the response.',
      { ...CODE_KEY, ...NODE_KEY },
    ),
    backendLatency: distribution(
      'Backend latency',
      'ms',
      'Latency between the router and the backend services.',
      { ...CODE_KEY, ...NODE_KEY },
    ),
  },
  brokerTopic: {
    published: rate('Published', '{message}/s', 'Messages published.'),
    publishRequests: rate(
      'Publish requests',
      '{request}/s',
      'Requests publishing messages.',
      CODE_KEY,
    ),
    publishLatency: distribution(
      'Publish latency',
      'ms',
      'Latency of publish requests, as measured by the broker.',
    ),
    messageSize: distribution(
      'Message size',
      'By',
      'Size of the published messages.',
    ),
  },
  brokerSubscription: {
    backlog: gauge('Backlog', '{message}', 'Messages not yet acknowledged.'),
    backlogAge: gauge(
      'Backlog age',
      's',
      'Age of the oldest unacknowledged message.',
    ),
    delivered: rate(
      'Delivered',
      '{message}/s',
      'Messages delivered to the subscriber, including redeliveries.',
    ),
    acked: rate(
      'Acknowledged',
      '{message}/s',
      'Messages acknowledged by the subscriber, excluding those discarded by the subscription filter.',
    ),
    pushRequests: rate(
      'Push requests',
      '{request}/s',
      'Requests pushing messages to the target.',
      CODE_KEY,
    ),
    pushLatency: distribution(
      'Push latency',
      'ms',
      'Latency of push requests, i.e. the processing time of the target.',
      CODE_KEY,
    ),
  },
  queue: {
    backlog: gauge('Backlog', '{task}', 'Tasks in the queue.'),
    published: rate('Published', '{task}/s', 'Tasks created.', CODE_KEY),
    pushRequests: rate(
      'Push requests',
      '{request}/s',
      'Attempts to dispatch tasks to the target, including retries.',
      CODE_KEY,
    ),
    dispatchDelay: distribution(
      'Dispatch delay',
      'ms',
      "Delay between a task's scheduled time and its actual dispatch.",
    ),
  },
  database: {
    requests: rate('Requests', '{request}/s', 'Requests to the database.', {
      method: "The provider's API method.",
      ...CODE_KEY,
    }),
    latency: distribution(
      'Latency',
      'ms',
      'Latency of requests, as measured by the database.',
      { method: "The provider's API method." },
    ),
    storage: gauge('Storage', 'By', 'Stored data, including indexes.'),
    cpuUtilization: gauge(
      'CPU utilization',
      '%',
      "The database's share of the CPU utilization of the instance it runs on.",
    ),
  },
};

/**
 * Sums several values of a metric, e.g. to compute a total from groups.
 * Numbers are summed, and distributions are merged by summing their counts.
 *
 * @param measures The values to sum. There must be at least one, and they must all be numbers, or distributions using
 *   the same layout.
 * @returns The sum.
 */
export function sumGraphMetricMeasures(
  measures: GraphMetricMeasure[],
): GraphMetricMeasure {
  if (measures.length === 0) {
    throw new Error('At least one value must be summed.');
  }

  if (measures.every((m) => typeof m === 'number')) {
    return measures.reduce((sum, m) => sum + m, 0);
  }

  const distributions = measures.filter(
    (m): m is GraphDistribution => typeof m !== 'number',
  );
  const [{ layout }] = distributions;
  if (
    distributions.length !== measures.length ||
    distributions.some((d) => d.layout !== layout)
  ) {
    throw new Error(
      'Only numbers, or distributions using the same layout, can be summed.',
    );
  }

  const count = distributions.reduce((sum, d) => sum + d.count, 0);
  const total = distributions.reduce(
    (sum, d) => sum + (d.mean ?? 0) * d.count,
    0,
  );
  const buckets: Record<string, number> = {};
  for (const distribution of distributions) {
    for (const [index, bucketCount] of Object.entries(distribution.buckets)) {
      buckets[index] = (buckets[index] ?? 0) + bucketCount;
    }
  }

  return {
    layout,
    count,
    ...(count > 0 ? { mean: total / count } : {}),
    buckets,
  };
}
