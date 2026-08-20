/**
 * Extract Tables Processor
 * 
 * Extracts tables from PDF and exports them as JSON, Markdown, or CSV.
 * Uses text extraction and table detection algorithms.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfjs } from '../loader';
import type { TextItem as PdfjsTextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Output format for extracted tables
 */
export type TableExportFormat = 'json' | 'markdown' | 'csv';

/**
 * Extract Tables options
 */
export interface ExtractTablesOptions {
    /** Output format */
    format: TableExportFormat;
    /** Page range (e.g., "1-5,8", empty for all) */
    pageRange?: string;
    /** Minimum number of columns to consider as table */
    minColumns: number;
    /** Minimum number of rows to consider as table */
    minRows: number;
    /** Whether to include page numbers in output */
    includePageNumbers: boolean;
}

/**
 * Default extract tables options
 */
const DEFAULT_EXTRACT_OPTIONS: ExtractTablesOptions = {
    format: 'json',
    pageRange: '',
    minColumns: 2,
    minRows: 2,
    includePageNumbers: true,
};

/**
 * Represents a detected table
 */
interface DetectedTable {
    pageNumber: number;
    rows: string[][];
    startY: number;
    endY: number;
}

/**
 * Text item from PDF.js
 */
interface TextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
}

/**
 * Parse page range string
 */
function parsePageRange(rangeStr: string, totalPages: number): number[] {
    if (!rangeStr || rangeStr.trim() === '') {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set<number>();
    const parts = rangeStr.split(',').map(p => p.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
                    pages.add(i);
                }
            }
        } else {
            const pageNum = parseInt(part, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                pages.add(pageNum);
            }
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Detect tables from text items on a page
 * This is a simplified algorithm - real table detection is more complex
 */
function detectTables(
    textItems: TextItem[],
    pageNumber: number,
    minColumns: number,
    minRows: number
): DetectedTable[] {
    if (textItems.length === 0) return [];

    // Group text items by Y position (rows)
    const tolerance = 5; // Y position tolerance for grouping
    const rowGroups = new Map<number, TextItem[]>();

    for (const item of textItems) {
        const y = Math.round(item.transform[5] / tolerance) * tolerance;
        if (!rowGroups.has(y)) {
            rowGroups.set(y, []);
        }
        rowGroups.get(y)!.push(item);
    }

    // Sort rows by Y position (descending for PDF coordinates)
    const sortedYs = Array.from(rowGroups.keys()).sort((a, b) => b - a);

    // Detect potential column positions
    const columnPositions = new Set<number>();
    const xTolerance = 10;

    for (const items of rowGroups.values()) {
        for (const item of items) {
            const x = Math.round(item.transform[4] / xTolerance) * xTolerance;
            columnPositions.add(x);
        }
    }

    const sortedColumns = Array.from(columnPositions).sort((a, b) => a - b);

    // If not enough columns, no table
    if (sortedColumns.length < minColumns) return [];

    // Look for consecutive rows with similar column structure
    const tables: DetectedTable[] = [];
    let currentTable: string[][] = [];
    let tableStartY = 0;
    let tableEndY = 0;

    for (const y of sortedYs) {
        const items = rowGroups.get(y)!;

        // Assign items to columns
        const row: string[] = new Array(sortedColumns.length).fill('');

        for (const item of items) {
            const x = Math.round(item.transform[4] / xTolerance) * xTolerance;
            const colIndex = sortedColumns.indexOf(x);
            if (colIndex >= 0) {
                row[colIndex] = (row[colIndex] + ' ' + item.str).trim();
            }
        }

        // Check if this row has enough non-empty cells
        const nonEmptyCells = row.filter(cell => cell.trim() !== '').length;

        if (nonEmptyCells >= minColumns) {
            if (currentTable.length === 0) {
                tableStartY = y;
            }
            tableEndY = y;
            currentTable.push(row);
        } else if (currentTable.length >= minRows) {
            // End of table
            tables.push({
                pageNumber,
                rows: currentTable,
                startY: tableStartY,
                endY: tableEndY,
            });
            currentTable = [];
        } else {
            // Not enough rows, reset
            currentTable = [];
        }
    }

    // Don't forget the last table
    if (currentTable.length >= minRows) {
        tables.push({
            pageNumber,
            rows: currentTable,
            startY: tableStartY,
            endY: tableEndY,
        });
    }

    return tables;
}

/**
 * Convert tables to JSON
 */
function tablesToJson(tables: DetectedTable[], includePageNumbers: boolean): string {
    const output = tables.map((table, index) => {
        const headers = table.rows[0];
        const dataRows = table.rows.slice(1);

        const result: { tableIndex: number; headers: string[]; rows: Record<string, string>[]; pageNumber?: number } = {
            tableIndex: index + 1,
            headers,
            rows: dataRows.map(row => {
                const obj: Record<string, string> = {};
                headers.forEach((header, i) => {
                    obj[header || `column_${i + 1}`] = row[i] || '';
                });
                return obj;
            }),
        };

        if (includePageNumbers) {
            result.pageNumber = table.pageNumber;
        }

        return result;
    });

    return JSON.stringify(output, null, 2);
}

/**
 * Convert tables to Markdown
 */
function tablesToMarkdown(tables: DetectedTable[], includePageNumbers: boolean): string {
    let output = '';

    tables.forEach((table, index) => {
        if (includePageNumbers) {
            output += `## Table ${index + 1} (Page ${table.pageNumber})\n\n`;
        } else {
            output += `## Table ${index + 1}\n\n`;
        }

        // Header row
        output += '| ' + table.rows[0].map(cell => cell || ' ').join(' | ') + ' |\n';

        // Separator
        output += '| ' + table.rows[0].map(() => '---').join(' | ') + ' |\n';

        // Data rows
        for (let i = 1; i < table.rows.length; i++) {
            output += '| ' + table.rows[i].map(cell => cell || ' ').join(' | ') + ' |\n';
        }

        output += '\n';
    });

    return output;
}

/**
 * Convert tables to CSV
 */
function tablesToCsv(tables: DetectedTable[], includePageNumbers: boolean): string {
    let output = '';

    tables.forEach((table, index) => {
        if (includePageNumbers) {
            output += `# Table ${index + 1} (Page ${table.pageNumber})\n`;
        }

        for (const row of table.rows) {
            output += row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma
                const escaped = cell.replace(/"/g, '""');
                return escaped.includes(',') || escaped.includes('\n')
                    ? `"${escaped}"`
                    : escaped;
            }).join(',') + '\n';
        }

        output += '\n';
    });

    return output;
}

/**
 * Extract Tables Processor
 */
export class ExtractTablesProcessor extends BasePDFProcessor {
    /**
     * Process PDF file and extract tables
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const extractOptions: ExtractTablesOptions = {
            ...DEFAULT_EXTRACT_OPTIONS,
            ...(options as Partial<ExtractTablesOptions>),
        };

        // Validate single file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one PDF file.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        try {
            this.updateProgress(5, 'Loading PDF library...');

            // Load PDF.js library
            const pdfjsLib = await loadPdfjs();

            this.updateProgress(10, 'Loading PDF file...');

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            // Load PDF with pdf.js
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;

            const totalPages = pdfDoc.numPages;

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(10, 'Parsing page range...');

            // Parse page range
            const pagesToProcess = parsePageRange(extractOptions.pageRange || '', totalPages);

            this.updateProgress(15, 'Extracting tables...');

            const allTables: DetectedTable[] = [];

            // Process each page
            for (let i = 0; i < pagesToProcess.length; i++) {
                if (this.checkCancelled()) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_CANCELLED,
                        'Processing was cancelled.'
                    );
                }

                const pageNum = pagesToProcess[i];
                const progress = 15 + ((i / pagesToProcess.length) * 70);
                this.updateProgress(progress, `Analyzing page ${pageNum}...`);

                try {
                    const page = await pdfDoc.getPage(pageNum);
                    const textContent = await page.getTextContent();

                    const textItems: TextItem[] = textContent.items
                        .filter((item): item is PdfjsTextItem => 'str' in item)
                        .map((item) => ({
                            str: item.str,
                            transform: item.transform,
                            width: item.width,
                            height: item.height,
                        }));

                    const tables = detectTables(
                        textItems,
                        pageNum,
                        extractOptions.minColumns,
                        extractOptions.minRows
                    );

                    allTables.push(...tables);
                } catch (pageError) {
                    console.warn(`Failed to process page ${pageNum}:`, pageError);
                }
            }

            this.updateProgress(90, 'Formatting output...');

            if (allTables.length === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_FAILED,
                    'No tables found in the PDF.',
                    'Try adjusting the minimum columns/rows settings or check a different page range.'
                );
            }

            // Format output
            let content: string;
            let mimeType: string;
            let extension: string;

            switch (extractOptions.format) {
                case 'json':
                    content = tablesToJson(allTables, extractOptions.includePageNumbers);
                    mimeType = 'application/json';
                    extension = '.json';
                    break;
                case 'markdown':
                    content = tablesToMarkdown(allTables, extractOptions.includePageNumbers);
                    mimeType = 'text/markdown';
                    extension = '.md';
                    break;
                case 'csv':
                    content = tablesToCsv(allTables, extractOptions.includePageNumbers);
                    mimeType = 'text/csv';
                    extension = '.csv';
                    break;
                default:
                    content = tablesToJson(allTables, extractOptions.includePageNumbers);
                    mimeType = 'application/json';
                    extension = '.json';
            }

            const blob = new Blob([content], { type: mimeType });

            this.updateProgress(100, 'Complete!');

            // Generate output filename
            const baseName = file.name.replace(/\.pdf$/i, '');
            const outputFilename = `${baseName}_tables${extension}`;

            return this.createSuccessOutput(blob, outputFilename, {
                tablesFound: allTables.length,
                pagesProcessed: pagesToProcess.length,
                format: extractOptions.format,
            });

        } catch (error) {
            if (error instanceof Error && error.message.includes('encrypt')) {
                return this.createErrorOutput(
                    PDFErrorCode.PDF_ENCRYPTED,
                    'The PDF file is encrypted.',
                    'Please decrypt the file first.'
                );
            }

            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to extract tables from PDF.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['application/pdf'];
    }
}

/**
 * Create a new instance of the extract tables processor
 */
export function createExtractTablesProcessor(): ExtractTablesProcessor {
    return new ExtractTablesProcessor();
}

/**
 * Extract tables from PDF (convenience function)
 */
export async function extractTables(
    file: File,
    options?: Partial<ExtractTablesOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createExtractTablesProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
