// Single typed entry point for the Shaka core (UI-less) build.
//
// Clutz emits shaka-player's types as a GLOBAL `shaka` namespace (see
// src/types/shaka-player.d.ts), not an ES module, so the compiled import has no
// module-shaped types and TypeScript reports it as "not a module". We suppress that
// one error here and re-type the runtime value against the global `shaka` namespace,
// exporting it once so the rest of the app imports a fully-typed `shaka`.
//
// @ts-expect-error -- shaka-player.compiled.d.ts is a global namespace, not a module.
import shakaRuntime from "shaka-player/dist/shaka-player.compiled";

const lib: typeof shaka = shakaRuntime;

export default lib;
