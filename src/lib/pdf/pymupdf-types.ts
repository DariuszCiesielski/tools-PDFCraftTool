/**
 * Types for the PyMuPDF (Pyodide) WASM wrapper.
 *
 * These describe only the subset of the Pyodide API this app uses and the
 * shapes actually read/produced by the wrapper methods in pymupdf-loader.ts.
 */

/** Subset of Pyodide's Emscripten virtual filesystem API used by the wrapper. */
export interface PyodideFS {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
}

/** Subset of the Pyodide runtime API used by the wrapper. */
export interface PyodideAPI {
    FS: PyodideFS;
    loadPackage(url: string): Promise<unknown>;
    runPython(code: string): unknown;
    /** All wrapper calls return a base64/JSON string from Python. */
    runPythonAsync(code: string): Promise<string>;
}

export interface PdfToPdfaOptions {
    /** Reserved for future use (level, embedFonts, flattenTransparency). */
    level?: string;
    embedFonts?: boolean;
    flattenTransparency?: boolean;
}

export interface HtmlToPdfAttachment {
    filename?: string;
    contentType?: string;
    content?: ArrayBuffer | ArrayLike<number>;
}

export interface HtmlToPdfOptions {
    pageSize?: string;
    margins?: { top: number; right: number; bottom: number; left: number };
    attachments?: HtmlToPdfAttachment[];
}

export interface DeskewPdfOptions {
    threshold?: number;
    dpi?: number;
}

/** Shape of result_data produced by the deskew Python snippet. */
export interface DeskewResult {
    totalPages: number;
    correctedPages: number;
    angles: number[];
    corrected: boolean[];
}

export interface FontToOutlineOptions {
    dpi?: number;
    preserveSelectableText?: boolean;
    pageRange?: string;
}

/** Layer entry returned by getOCGLayers (JSON from Python). */
export interface OCGLayer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
}

export interface ToggleOCGLayerOptions {
    layerId: string;
    visible: boolean;
}

export interface AddOCGLayerOptions {
    name: string;
}

export interface DeleteOCGLayerOptions {
    layerId?: string;
}

export interface RenameOCGLayerOptions {
    layerId?: string;
    newName?: string;
}

export interface CompressOptions {
    quality?: string;
    removeMetadata?: boolean;
}

export interface PhotonCompressOptions {
    dpi?: number;
    format?: string;
    quality?: number;
}

/** Wrapper object returned by loadPyMuPDF(). */
export interface PyMuPDFInstance {
    pyodide: PyodideAPI;
    pdfToDocx(file: File): Promise<Blob>;
    pdfToPdfa(file: File, options: PdfToPdfaOptions): Promise<{ pdf: Blob }>;
    htmlToPdf(html: string, options: HtmlToPdfOptions): Promise<Blob>;
    deskewPdf(file: File, options: DeskewPdfOptions): Promise<{ pdf: Blob; result: DeskewResult }>;
    fontToOutline(
        file: File,
        options: FontToOutlineOptions
    ): Promise<{ pdf: Blob; fontsConverted: number; pagesProcessed: number; totalPages: number }>;
    getOCGLayers(file: File): Promise<OCGLayer[]>;
    toggleOCGLayer(file: File, options: ToggleOCGLayerOptions): Promise<{ pdf: Blob }>;
    addOCGLayer(file: File, options: AddOCGLayerOptions): Promise<{ pdf: Blob; layerId: string }>;
    deleteOCGLayer(file: File, options: DeleteOCGLayerOptions): Promise<{ pdf: Blob }>;
    renameOCGLayer(file: File, options: RenameOCGLayerOptions): Promise<{ pdf: Blob }>;
    compress(file: File, options: CompressOptions): Promise<Blob>;
    photonCompress(file: File, options: PhotonCompressOptions): Promise<Blob>;
}
