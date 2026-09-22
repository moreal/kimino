/** Compatibility aliases share one implementation and cancellation class identity. */
export {
  createCollectionReadController as createTimelineReadController,
  CollectionReadCancelled as TimelineReadCancelled,
  type CollectionReadController as TimelineReadController,
  type CollectionReadOptions as TimelineReadOptions,
  type CollectionReadProgress as TimelineReadProgress,
} from './collection-read';
