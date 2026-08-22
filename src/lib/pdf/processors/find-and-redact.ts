/**
 * Find and Redact Processor
 * Requirements: 5.1
 * 
 * Search for specific text/patterns across all pages and redact matching content.
 * Useful for batch redacting sensitive information like account numbers, names, etc.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { loadPdfjs } from '../loader';

/**
 * Text match found in the PDF
 */
export interface TextMatch {
    /** Page number (1-indexed) */
    page: number;
    /** Text content that matched */
    text: string;
    /** X coordinate from left edge (in points) */
    x: number;
    /** Y coordinate from bottom edge (in points) - PDF coordinates */
    y: number;
    /** Width of the text (in points) */
    width: number;
    /** Height of the text (in points) */
    height: number;
    /** Unique identifier for this match */
    id: string;
    /** Whether this match is selected for redaction */
    selected: boolean;
}

/**
 * Search options for finding text
 */
export interface SearchOptions {
    /** Single search term or pattern (for backwards compatibility) */
    searchTerm?: string;
    /** Multiple search terms (comma or newline separated in input) */
    searchTerms?: string[];
    /** Whether to use case-sensitive matching */
    caseSensitive: boolean;
    /** Whether to use regex pattern matching */
    useRegex: boolean;
    /** Whether to match whole words only */
    wholeWord: boolean;
}

/**
 * Parse search input into multiple terms
 */
export function parseSearchTerms(input: string): string[] {
    // Split by comma (both English and Chinese), newline, trim whitespace, and filter empty strings
    return input
        .split(/[,，\n]/)
        .map(term => term.trim())
        .filter(term => term.length > 0);
}

/**
 * Redaction options
 */
export interface FindAndRedactOptions extends SearchOptions {
    /** Color for the redaction boxes (default: black) */
    color?: { r: number; g: number; b: number };
    /** Whether to add a border around redaction boxes */
    addBorder?: boolean;
    /** Replacement text to show in redacted areas */
    replacementText?: string;
    /** Array of match IDs to redact (if empty, redact all matches) */
    selectedMatchIds?: string[];
}

/**
 * Search result containing all matches
 */
export interface SearchResult {
    success: boolean;
    matches: TextMatch[];
    totalCount: number;
    pagesWithMatches: number[];
    error?: string;
}

/**
 * Redaction result
 */
export interface RedactionResult {
    success: boolean;
    result?: Blob;
    error?: string;
    redactedCount: number;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Search for text in a PDF document
 * Returns all matches with their positions for preview
 */
export async function searchTextInPDF(
    file: File,
    options: SearchOptions,
    onProgress?: ProgressCallback
): Promise<SearchResult> {
    try {
        if (!file) {
            return {
                success: false,
                matches: [],
                totalCount: 0,
                pagesWithMatches: [],
                error: 'No file provided',
            };
        }

        // Get search terms array
        const searchTerms: string[] = options.searchTerms && options.searchTerms.length > 0
            ? options.searchTerms
            : options.searchTerm
                ? [options.searchTerm]
                : [];

        if (searchTerms.length === 0 || searchTerms.every(t => t.trim() === '')) {
            return {
                success: false,
                matches: [],
                totalCount: 0,
                pagesWithMatches: [],
                error: 'Search term is required',
            };
        }

        onProgress?.(5, 'Loading PDF library...');

        const pdfjs = await loadPdfjs();
        const arrayBuffer = await file.arrayBuffer();

        onProgress?.(10, 'Loading PDF document...');

        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const matches: TextMatch[] = [];
        const pagesWithMatches: Set<number> = new Set();

        // Build search patterns for all terms
        const searchPatterns: { pattern: RegExp; term: string }[] = [];
        try {
            for (const term of searchTerms) {
                if (!term.trim()) continue;

                let pattern: RegExp;
                if (options.useRegex) {
                    pattern = new RegExp(
                        term,
                        options.caseSensitive ? 'g' : 'gi'
                    );
                } else {
                    // Escape special regex characters for literal search
                    let escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (options.wholeWord) {
                        escapedTerm = `\\b${escapedTerm}\\b`;
                    }
                    pattern = new RegExp(
                        escapedTerm,
                        options.caseSensitive ? 'g' : 'gi'
                    );
                }
                searchPatterns.push({ pattern, term });
            }
        } catch (regexError) {
            return {
                success: false,
                matches: [],
                totalCount: 0,
                pagesWithMatches: [],
                error: `Invalid search pattern: ${regexError instanceof Error ? regexError.message : 'Unknown error'}`,
            };
        }

        if (searchPatterns.length === 0) {
            return {
                success: false,
                matches: [],
                totalCount: 0,
                pagesWithMatches: [],
                error: 'No valid search terms provided',
            };
        }

        const progressPerPage = 85 / totalPages;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageProgress = 10 + (pageNum - 1) * progressPerPage;
            onProgress?.(pageProgress, `Searching page ${pageNum} of ${totalPages}...`);

            try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();

                // Process text items to find matches
                for (const item of textContent.items) {
                    if (!('str' in item) || !('transform' in item)) continue;

                    const textItem = item as {
                        str: string;
                        transform: number[];
                        width: number;
                        height: number;
                        fontName?: string;
                    };

                    const text = textItem.str;
                    if (!text) continue;

                    // Search for each pattern in the text
                    for (const { pattern: searchPattern } of searchPatterns) {
                        // Find all matches in this text item
                        let match: RegExpExecArray | null;
                        searchPattern.lastIndex = 0; // Reset regex state

                        while ((match = searchPattern.exec(text)) !== null) {
                            // Calculate approximate position of the match within the text item
                            const matchStart = match.index;
                            const matchText = match[0];
                            const fullTextWidth = textItem.width;
                            const charWidth = fullTextWidth / text.length;

                            // Transform matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
                            const transform = textItem.transform;
                            const x = transform[4] + matchStart * charWidth;
                            const y = transform[5];
                            const width = matchText.length * charWidth;
                            const height = Math.abs(textItem.height) || Math.abs(transform[0]) * 0.8;

                            // Convert to PDF coordinates (origin at bottom-left)
                            // The y-coordinate from getTextContent is already in PDF coordinates
                            const pdfY = y;

                            matches.push({
                                page: pageNum,
                                text: matchText,
                                x: x,
                                y: pdfY,
                                width: width,
                                height: height,
                                id: `match-${pageNum}-${x.toFixed(2)}-${pdfY.toFixed(2)}-${matches.length}`,
                                selected: true, // Selected by default
                            });

                            pagesWithMatches.add(pageNum);

                            // Prevent infinite loop for zero-length matches
                            if (match[0].length === 0) {
                                searchPattern.lastIndex++;
                            }
                        }
                    }
                }
            } catch (pageError) {
                console.warn(`Error processing page ${pageNum}:`, pageError);
                // Continue with other pages
            }
        }

        onProgress?.(100, 'Search complete');

        return {
            success: true,
            matches,
            totalCount: matches.length,
            pagesWithMatches: Array.from(pagesWithMatches).sort((a, b) => a - b),
        };
    } catch (error) {
        console.error('Search error:', error);
        return {
            success: false,
            matches: [],
            totalCount: 0,
            pagesWithMatches: [],
            error: error instanceof Error ? error.message : 'Failed to search PDF',
        };
    }
}

/**
 * Apply redactions to found text matches
 */
export async function applyFindAndRedact(
    file: File,
    matches: TextMatch[],
    options: Omit<FindAndRedactOptions, keyof SearchOptions>,
    onProgress?: ProgressCallback
): Promise<RedactionResult> {
    try {
        if (!file) {
            return {
                success: false,
                error: 'No file provided',
                redactedCount: 0,
            };
        }

        // Filter to only selected matches
        const selectedMatches = options.selectedMatchIds && options.selectedMatchIds.length > 0
            ? matches.filter(m => options.selectedMatchIds!.includes(m.id))
            : matches.filter(m => m.selected);

        if (selectedMatches.length === 0) {
            return {
                success: false,
                error: 'No matches selected for redaction',
                redactedCount: 0,
            };
        }

        onProgress?.(10, 'Loading PDF...');

        // Load the PDF with pdf-lib
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, {
            ignoreEncryption: true,
        });

        const pages = pdfDoc.getPages();
        const pageCount = pages.length;

        // Default redaction color (black)
        const redactionColor = options.color
            ? rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255)
            : rgb(0, 0, 0);

        let redactedCount = 0;
        const progressPerMatch = 80 / selectedMatches.length;

        // Embed font for replacement text
        let font = null;
        if (options.replacementText) {
            font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }

        for (let i = 0; i < selectedMatches.length; i++) {
            const match = selectedMatches[i];
            const progress = 10 + i * progressPerMatch;
            onProgress?.(progress, `Redacting ${i + 1} of ${selectedMatches.length}...`);

            // Validate page number
            if (match.page < 1 || match.page > pageCount) {
                console.warn(`Invalid page number: ${match.page}. Skipping.`);
                continue;
            }

            const page = pages[match.page - 1];

            // The y-coordinate is already in PDF coordinates (from bottom)
            // We need to draw the rectangle at this position
            const pdfY = match.y;

            // Draw filled rectangle over the matched text
            page.drawRectangle({
                x: match.x,
                y: pdfY,
                width: match.width,
                height: match.height,
                color: redactionColor,
                opacity: 1, // Fully opaque
            });

            // Add border if requested
            if (options.addBorder) {
                page.drawRectangle({
                    x: match.x,
                    y: pdfY,
                    width: match.width,
                    height: match.height,
                    borderColor: rgb(0.3, 0.3, 0.3),
                    borderWidth: 0.5,
                });
            }

            // Add replacement text if specified
            if (options.replacementText && font) {
                const fontSize = Math.min(match.height * 0.7, 10);
                const textWidth = font.widthOfTextAtSize(options.replacementText, fontSize);

                // Center the text in the redaction box
                const textX = match.x + (match.width - textWidth) / 2;
                const textY = pdfY + (match.height - fontSize) / 2;

                page.drawText(options.replacementText, {
                    x: textX,
                    y: textY,
                    size: fontSize,
                    font,
                    color: rgb(1, 1, 1), // White text on black background
                });
            }

            redactedCount++;
        }

        onProgress?.(95, 'Saving PDF...');

        // Save the modified PDF
        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        const outputBuffer = pdfBytes.buffer.slice(
            pdfBytes.byteOffset,
            pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([outputBuffer], { type: 'application/pdf' });

        onProgress?.(100, 'Complete!');

        return {
            success: true,
            result: blob,
            redactedCount,
        };
    } catch (error) {
        console.error('Redaction error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to apply redactions',
            redactedCount: 0,
        };
    }
}

/**
 * Combined function to search and redact in one step
 */
export async function findAndRedact(
    file: File,
    options: FindAndRedactOptions,
    onProgress?: ProgressCallback
): Promise<RedactionResult> {
    // First, search for matches
    const searchResult = await searchTextInPDF(
        file,
        {
            searchTerm: options.searchTerm,
            caseSensitive: options.caseSensitive,
            useRegex: options.useRegex,
            wholeWord: options.wholeWord,
        },
        (progress, message) => onProgress?.(progress * 0.5, message)
    );

    if (!searchResult.success || searchResult.matches.length === 0) {
        return {
            success: searchResult.success,
            error: searchResult.error || 'No matches found',
            redactedCount: 0,
        };
    }

    // Then apply redactions
    return applyFindAndRedact(
        file,
        searchResult.matches,
        {
            color: options.color,
            addBorder: options.addBorder,
            replacementText: options.replacementText,
            selectedMatchIds: options.selectedMatchIds,
        },
        (progress, message) => onProgress?.(50 + progress * 0.5, message)
    );
}

const findAndRedactProcessor = {
    searchTextInPDF,
    applyFindAndRedact,
    findAndRedact,
    parseSearchTerms,
};

export default findAndRedactProcessor;
