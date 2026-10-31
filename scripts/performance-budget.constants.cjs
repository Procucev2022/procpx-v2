const PERFORMANCE_BUDGETS = Object.freeze({
  maxInitialJavaScriptGzipBytesPerRoute: 500_000,
  maxEmittedCssGzipBytes: 50_000,
  gzipLevel: 9,
});

module.exports = { PERFORMANCE_BUDGETS };
