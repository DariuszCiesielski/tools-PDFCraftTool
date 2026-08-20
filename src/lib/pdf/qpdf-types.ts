/**
 * Types for the qpdf-wasm Emscripten module.
 *
 * Several processors (decrypt, encrypt, repair, change-permissions,
 * remove-restrictions) load qpdf.js via script injection and use this
 * subset of the Emscripten API.
 */

/** Subset of the Emscripten virtual filesystem API used with qpdf. */
export interface QpdfFS {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string, opts: { encoding: 'binary' }): Uint8Array<ArrayBuffer>;
  unlink(path: string): void;
}

/** qpdf-wasm module instance (subset actually used). */
export interface QpdfEmscriptenModule {
  FS: QpdfFS;
  callMain(args: string[]): number;
}

/** Emscripten module factory options used by qpdf.js. */
export interface QpdfFactoryOptions {
  locateFile: (path: string) => string;
}

export type QpdfModuleFactory = (
  options: QpdfFactoryOptions
) => Promise<QpdfEmscriptenModule>;

/** Window globals exposed by the injected qpdf.js script. */
export type QpdfWindow = Window & {
  createQpdfModule?: QpdfModuleFactory;
  Module?: QpdfModuleFactory;
};
