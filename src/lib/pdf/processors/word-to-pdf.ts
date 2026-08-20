/**
 * Word to PDF Processor
 * 
 * Converts Word documents to PDF using LibreOffice WASM.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import type { LibreOfficeConverter, LoadProgress } from '@/lib/libreoffice/converter';

/** Maximum file size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** Conversion timeout: 5 minutes */
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

export type WordToPDFOptions = Record<string, unknown>; // Reserved for future options

let converterPromise: Promise<void> | null = null;
let converterInstance: LibreOfficeConverter | null = null;

async function getConverter(onProgress?: (percent: number, message: string) => void): Promise<LibreOfficeConverter> {
    if (converterInstance?.isReady()) return converterInstance;

    if (converterPromise) {
        await converterPromise;
        return converterInstance!;
    }

    converterPromise = (async () => {
        const { getLibreOfficeConverter } = await import('@/lib/libreoffice');
        converterInstance = getLibreOfficeConverter();
        await converterInstance.initialize((progress: LoadProgress) => {
            onProgress?.(progress.percent, progress.message);
        });
    })();

    await converterPromise;
    return converterInstance!;
}

export class WordToPDFProcessor extends BasePDFProcessor {
    private conversionProgressTimer: ReturnType<typeof setInterval> | null = null;

    private startConversionProgress(message: string): void {
        this.stopConversionProgress();
        // LibreOffice convert() does not expose granular runtime progress.
        // Keep UI responsive by advancing a bounded pseudo-progress while waiting.
        this.conversionProgressTimer = setInterval(() => {
            if (this.progress >= 98) return;
            this.updateProgress(this.progress + 1, message);
        }, 800);
    }

    private stopConversionProgress(): void {
        if (this.conversionProgressTimer) {
            clearInterval(this.conversionProgressTimer);
            this.conversionProgressTimer = null;
        }
    }

    protected reset(): void {
        this.stopConversionProgress();
        super.reset();
    }

    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files } = input;

        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one Word document.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const validExts = ['docx', 'doc', 'odt', 'rtf'];

        if (!validExts.includes(ext)) {
            return this.createErrorOutput(
                PDFErrorCode.FILE_TYPE_INVALID,
                'Invalid file type. Please upload .docx, .doc, .odt, or .rtf.',
                `Received: ${file.type || file.name}`
            );
        }

        // File size guard
        if (file.size > MAX_FILE_SIZE) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
                `File size: ${file.size} bytes, limit: ${MAX_FILE_SIZE} bytes`
            );
        }

        try {
            this.updateProgress(5, 'Loading conversion engine (first time may take 1-2 minutes)...');

            const converter = await getConverter((percent, message) => {
                this.updateProgress(Math.min(percent * 0.8, 80), message);
            });

            if (this.checkCancelled()) {
                return this.createErrorOutput(PDFErrorCode.PROCESSING_CANCELLED, 'Processing was cancelled.');
            }

            this.updateProgress(85, 'Converting Word document to PDF...');
            this.startConversionProgress('Converting Word document to PDF...');

            // Convert with timeout protection
            const pdfBlob = await Promise.race([
                converter.convertToPdf(file),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(
                        `Conversion timed out after ${CONVERT_TIMEOUT_MS / 60000} minutes. The file may be too complex.`
                    )), CONVERT_TIMEOUT_MS)
                ),
            ]);
            this.stopConversionProgress();

            if (this.checkCancelled()) {
                return this.createErrorOutput(PDFErrorCode.PROCESSING_CANCELLED, 'Processing was cancelled.');
            }

            this.updateProgress(100, 'Conversion complete!');

            const baseName = file.name.replace(/\.(docx?|odt|rtf)$/i, '');
            return this.createSuccessOutput(pdfBlob, `${baseName}.pdf`, { format: 'pdf' });

        } catch (error) {
            this.stopConversionProgress();
            console.error('Conversion error:', error);
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to convert Word document to PDF.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }
}

export function createWordToPDFProcessor(): WordToPDFProcessor {
    return new WordToPDFProcessor();
}

export async function wordToPDF(
    file: File,
    options?: Partial<WordToPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createWordToPDFProcessor();
    return processor.process({ files: [file], options: options || {} }, onProgress);
}
