import { configureSync, getConsoleSink } from '@logtape/logtape';
configureSync({
  reset: true,
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ['kimino'], lowestLevel: 'info', sinks: ['console'] },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
  ],
});
