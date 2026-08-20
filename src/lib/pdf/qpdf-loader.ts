/**
 * QPDF WASM Loader
 * 
 * Dynamically loads qpdf-wasm in browser environment.
 * Uses script injection to avoid Next.js SSR bundling issues.
 */

import type { QpdfEmscriptenModule, QpdfWindow } from './qpdf-types';

// QPDF instance singleton
let qpdfInstance: QpdfEmscriptenModule | null = null;
let loadingPromise: Promise<QpdfEmscriptenModule> | null = null;

/**
 * Load the QPDF WASM module dynamically
 */
export async function loadQpdf(): Promise<QpdfEmscriptenModule> {
  // Return cached instance if available
  if (qpdfInstance) {
    return qpdfInstance;
  }

  // Return existing loading promise if already loading
  if (loadingPromise) {
    return loadingPromise;
  }

  // Only run in browser environment
  if (typeof window === 'undefined') {
    throw new Error('QPDF can only be initialized in browser environment');
  }

  loadingPromise = new Promise(async (resolve, reject) => {
    try {
      // Check if createModule is already available (script already loaded)
      const qpdfWindow = window as QpdfWindow;
      if (qpdfWindow.createQpdfModule) {
        qpdfInstance = await qpdfWindow.createQpdfModule({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              return '/qpdf.wasm';
            }
            return path;
          },
        });
        resolve(qpdfInstance);
        return;
      }

      // Load the script dynamically
      const script = document.createElement('script');
      script.src = '/qpdf.js';
      script.async = true;

      script.onload = async () => {
        try {
          // The script should expose createModule or similar
          const createModule = qpdfWindow.createQpdfModule || qpdfWindow.Module;
          
          if (!createModule) {
            throw new Error('QPDF module not found after script load');
          }

          qpdfInstance = await createModule({
            locateFile: (path: string) => {
              if (path.endsWith('.wasm')) {
                return '/qpdf.wasm';
              }
              return path;
            },
          });

          resolve(qpdfInstance);
        } catch (err) {
          reject(err);
        }
      };

      script.onerror = () => {
        reject(new Error('Failed to load QPDF script'));
      };

      document.head.appendChild(script);
    } catch (err) {
      reject(err);
    }
  });

  return loadingPromise;
}

/**
 * Check if QPDF is available
 */
export function isQpdfAvailable(): boolean {
  return qpdfInstance !== null;
}

/**
 * Reset QPDF instance (for testing)
 */
export function resetQpdf(): void {
  qpdfInstance = null;
  loadingPromise = null;
}
