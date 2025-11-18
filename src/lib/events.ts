// Domain event system for extensibility

import { logInfo } from './logger';

// Base event interface
export interface DomainEvent {
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// Specific event types
export interface SourceCreatedEvent extends DomainEvent {
  type: 'source.created';
  data: {
    sourceId: string;
    name: string;
    type: string;
  };
}

export interface ChunksIngestedEvent extends DomainEvent {
  type: 'chunks.ingested';
  data: {
    sourceId: string;
    count: number;
  };
}

export interface SegmentationStartedEvent extends DomainEvent {
  type: 'segmentation.started';
  data: {
    sourceId: string;
    jobId: string;
    mode: string;
  };
}

export interface SegmentationCompletedEvent extends DomainEvent {
  type: 'segmentation.completed';
  data: {
    sourceId: string;
    jobId: string;
    mode: string;
    episodesCreated: number;
    duration: number;
  };
}

export interface SegmentationFailedEvent extends DomainEvent {
  type: 'segmentation.failed';
  data: {
    sourceId: string;
    jobId: string;
    mode: string;
    error: string;
  };
}

export interface EpisodeCreatedEvent extends DomainEvent {
  type: 'episode.created';
  data: {
    episodeId: string;
    sourceId: string;
    episodeIndex: number;
    title?: string;
  };
}

export interface EpisodeTaggedEvent extends DomainEvent {
  type: 'episode.tagged';
  data: {
    episodeId: string;
    tagId: string;
    tagName: string;
  };
}

export interface SourceTaggedEvent extends DomainEvent {
  type: 'source.tagged';
  data: {
    sourceId: string;
    tagId: string;
    tagName: string;
  };
}

// Union type of all events
export type AllDomainEvents =
  | SourceCreatedEvent
  | ChunksIngestedEvent
  | SegmentationStartedEvent
  | SegmentationCompletedEvent
  | SegmentationFailedEvent
  | EpisodeCreatedEvent
  | EpisodeTaggedEvent
  | SourceTaggedEvent;

// Event handler type
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

// Event bus
class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on<T extends DomainEvent>(eventType: string, handler: EventHandler<T>) {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler as EventHandler);
    this.handlers.set(eventType, handlers);
  }

  off<T extends DomainEvent>(eventType: string, handler: EventHandler<T>) {
    const handlers = this.handlers.get(eventType) || [];
    const index = handlers.indexOf(handler as EventHandler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  async emit(event: DomainEvent) {
    logInfo(`Event emitted: ${event.type}`, { event });

    const handlers = this.handlers.get(event.type) || [];
    await Promise.all(handlers.map((handler) => handler(event)));
  }

  clear() {
    this.handlers.clear();
  }

  getHandlerCount(eventType?: string): number {
    if (eventType) {
      return (this.handlers.get(eventType) || []).length;
    }
    return Array.from(this.handlers.values()).reduce((sum, handlers) => sum + handlers.length, 0);
  }
}

// Global event bus
export const eventBus = new EventBus();

// Convenience functions for emitting events
export function emitSourceCreated(sourceId: string, name: string, type: string) {
  eventBus.emit({
    type: 'source.created',
    timestamp: new Date(),
    data: { sourceId, name, type },
  });
}

export function emitChunksIngested(sourceId: string, count: number) {
  eventBus.emit({
    type: 'chunks.ingested',
    timestamp: new Date(),
    data: { sourceId, count },
  });
}

export function emitSegmentationStarted(sourceId: string, jobId: string, mode: string) {
  eventBus.emit({
    type: 'segmentation.started',
    timestamp: new Date(),
    data: { sourceId, jobId, mode },
  });
}

export function emitSegmentationCompleted(
  sourceId: string,
  jobId: string,
  mode: string,
  episodesCreated: number,
  duration: number
) {
  eventBus.emit({
    type: 'segmentation.completed',
    timestamp: new Date(),
    data: { sourceId, jobId, mode, episodesCreated, duration },
  });
}

export function emitSegmentationFailed(sourceId: string, jobId: string, mode: string, error: string) {
  eventBus.emit({
    type: 'segmentation.failed',
    timestamp: new Date(),
    data: { sourceId, jobId, mode, error },
  });
}

export function emitEpisodeCreated(
  episodeId: string,
  sourceId: string,
  episodeIndex: number,
  title?: string
) {
  eventBus.emit({
    type: 'episode.created',
    timestamp: new Date(),
    data: { episodeId, sourceId, episodeIndex, title },
  });
}

export function emitEpisodeTagged(episodeId: string, tagId: string, tagName: string) {
  eventBus.emit({
    type: 'episode.tagged',
    timestamp: new Date(),
    data: { episodeId, tagId, tagName },
  });
}

export function emitSourceTagged(sourceId: string, tagId: string, tagName: string) {
  eventBus.emit({
    type: 'source.tagged',
    timestamp: new Date(),
    data: { sourceId, tagId, tagName },
  });
}
