/**
 * Lets acceptance tests import server modules that use extensionless relative
 * imports (as the esbuild/tsc build does): "./x" resolves to "./x.ts".
 * Import this before the module under test. Needs Node 22.15+ (CI uses 24).
 */
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});
