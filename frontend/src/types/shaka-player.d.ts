// Shaka ships Clutz-generated definitions that declare a GLOBAL `shaka` namespace
// (rather than an ES module) for the core, UI-less build. This reference pulls that
// ambient namespace into the program so it can be used as a type via `typeof shaka`
// in the runtime wrapper at src/lib/shaka.ts. We never rely on a global `shaka` value
// at runtime; the actual value comes from the import in that wrapper.
/// <reference path="../../node_modules/shaka-player/dist/shaka-player.compiled.d.ts" />
