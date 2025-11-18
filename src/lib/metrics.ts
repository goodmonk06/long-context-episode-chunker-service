import { logInfo } from './logger';

// Metrics abstraction that can be swapped for Prometheus, DataDog, etc.

export interface MetricLabels {
  [key: string]: string | number;
}

export interface IMetricsAdapter {
  recordCounter(name: string, value: number, labels?: MetricLabels): void;
  recordGauge(name: string, value: number, labels?: MetricLabels): void;
  recordHistogram(name: string, value: number, labels?: MetricLabels): void;
  recordTiming(name: string, durationMs: number, labels?: MetricLabels): void;
}

// In-memory metrics store (default implementation)
class InMemoryMetricsAdapter implements IMetricsAdapter {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timings: Map<string, number[]> = new Map();

  recordCounter(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    logInfo(`Counter: ${name}`, { value, labels });
  }

  recordGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
    logInfo(`Gauge: ${name}`, { value, labels });
  }

  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  recordTiming(name: string, durationMs: number, labels?: MetricLabels): void {
    const key = this.getKey(name, labels);
    const timings = this.timings.get(key) || [];
    timings.push(durationMs);
    this.timings.set(key, timings);
    logInfo(`Timing: ${name}`, { durationMs, labels });
  }

  private getKey(name: string, labels?: MetricLabels): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  // Utility methods for retrieving metrics
  getCounter(name: string, labels?: MetricLabels): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key) || 0;
  }

  getGauge(name: string, labels?: MetricLabels): number {
    const key = this.getKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  getHistogram(name: string, labels?: MetricLabels): number[] {
    const key = this.getKey(name, labels);
    return this.histograms.get(key) || [];
  }

  getTimings(name: string, labels?: MetricLabels): number[] {
    const key = this.getKey(name, labels);
    return this.timings.get(key) || [];
  }

  getAllMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(this.histograms),
      timings: Object.fromEntries(this.timings),
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timings.clear();
  }
}

// Global metrics instance
let metricsAdapter: IMetricsAdapter = new InMemoryMetricsAdapter();

export function setMetricsAdapter(adapter: IMetricsAdapter) {
  metricsAdapter = adapter;
}

export function getMetricsAdapter(): IMetricsAdapter {
  return metricsAdapter;
}

// Convenience functions
export function recordCounter(name: string, value: number = 1, labels?: MetricLabels) {
  metricsAdapter.recordCounter(name, value, labels);
}

export function recordGauge(name: string, value: number, labels?: MetricLabels) {
  metricsAdapter.recordGauge(name, value, labels);
}

export function recordHistogram(name: string, value: number, labels?: MetricLabels) {
  metricsAdapter.recordHistogram(name, value, labels);
}

export function recordTiming(name: string, durationMs: number, labels?: MetricLabels) {
  metricsAdapter.recordTiming(name, durationMs, labels);
}

// Timer utility
export function startMetricTimer(name: string, labels?: MetricLabels): () => void {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    recordTiming(name, duration, labels);
  };
}

// Domain-specific metrics
export const Metrics = {
  // Source metrics
  sourceCreated: () => recordCounter('source.created'),
  sourceDeleted: () => recordCounter('source.deleted'),
  sourcesTotal: (count: number) => recordGauge('sources.total', count),

  // Chunk metrics
  chunkIngested: (count: number = 1) => recordCounter('chunks.ingested', count),
  chunksTotal: (count: number) => recordGauge('chunks.total', count),

  // Episode metrics
  episodeCreated: (mode: string) => recordCounter('episode.created', 1, { mode }),
  episodesTotal: (count: number) => recordGauge('episodes.total', count),

  // Segmentation metrics
  segmentationStarted: (mode: string) => recordCounter('segmentation.started', 1, { mode }),
  segmentationCompleted: (mode: string, duration: number) =>
    recordTiming('segmentation.duration', duration, { mode }),
  segmentationFailed: (mode: string) => recordCounter('segmentation.failed', 1, { mode }),

  // Job metrics
  jobStarted: () => recordCounter('job.started'),
  jobCompleted: (status: string, duration: number) =>
    recordTiming('job.duration', duration, { status }),
  jobFailed: () => recordCounter('job.failed'),

  // API metrics
  apiRequest: (method: string, path: string) =>
    recordCounter('api.requests', 1, { method, path }),
  apiError: (statusCode: number) => recordCounter('api.errors', 1, { statusCode }),
  apiLatency: (method: string, path: string, duration: number) =>
    recordTiming('api.latency', duration, { method, path }),
};

export default Metrics;
