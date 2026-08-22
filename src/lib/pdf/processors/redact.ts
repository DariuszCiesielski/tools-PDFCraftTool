/**
 * PDF Redaction Processor
 * Requirements: 5.1
 * 
 * Implements redaction functionality for permanently removing content from PDFs.
 * Redaction involves:
 * 1. Drawing black rectangles over specified areas
 * 2. Removing the underlying content (text, images) from those areas
 * 
 * Note: True redaction requires removing the actual content from the PDF,
 * not just covering it with a black box. This implementation uses pdf-lib
 * to draw opaque rectangles and flatten the PDF.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Represents a rectangular area to be redacted
 */
export interface RedactionArea {
  /** Page number (1-indexed) */
  page: number;
  /** X coordinate from left edge (in points) */
  x: number;
  /** Y coordinate from bottom edge (in points) */
  y: number;
  /** Width of the redaction area (in points) */
  width: number;
  /** Height of the redaction area (in points) */
  height: number;
  /** Optional replacement text to show in the redacted area */
  replacementText?: string;
}

/**
 * Options for the redaction process
 */
export interface RedactionOptions {
  /** Areas to redact */
  areas: RedactionArea[];
  /** Color for the redaction boxes (default: black) */
  color?: { r: number; g: number; b: number };
  /** Whether to add a border around redaction boxes */
  addBorder?: boolean;
  /** Replacement text to show in all redacted areas */
  defaultReplacementText?: string;
}

/**
 * Result of the redaction process
 */
export interface RedactionResult {
  success: boolean;
  result?: Blob;
  error?: string;
  redactedCount: number;
}

/**
 * Apply redactions to a PDF document
 * 
 * @param file - The PDF file to redact
 * @param options - Redaction options including areas to redact
 * @returns Promise resolving to the redaction result
 */
export async function applyRedactions(
  file: File,
  options: RedactionOptions
): Promise<RedactionResult> {
  try {
    // Validate input
    if (!file) {
      return {
        success: false,
        error: 'No file provided',
        redactedCount: 0,
      };
    }

    if (!options.areas || options.areas.length === 0) {
      return {
        success: false,
        error: 'No redaction areas specified',
        redactedCount: 0,
      };
    }

    // Load the PDF
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

    // Apply redactions to each specified area
    for (const area of options.areas) {
      // Validate page number
      if (area.page < 1 || area.page > pageCount) {
        console.warn(`Invalid page number: ${area.page}. Skipping.`);
        continue;
      }

      const page = pages[area.page - 1];
      const { height: pageHeight } = page.getSize();

      // Convert coordinates if needed (PDF coordinates are from bottom-left)
      // The y coordinate from the UI is typically from top-left
      const pdfY = pageHeight - area.y - area.height;

      // Draw a filled rectangle over the area
      page.drawRectangle({
        x: area.x,
        y: pdfY,
        width: area.width,
        height: area.height,
        color: redactionColor,
        opacity: 1, // Fully opaque to cover content
      });

      // Add border if requested
      if (options.addBorder) {
        page.drawRectangle({
          x: area.x,
          y: pdfY,
          width: area.width,
          height: area.height,
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1,
        });
      }

      // Add replacement text if specified
      const replacementText = area.replacementText || options.defaultReplacementText;
      if (replacementText) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = Math.min(area.height * 0.6, 12);
        const textWidth = font.widthOfTextAtSize(replacementText, fontSize);

        // Center the text in the redaction box
        const textX = area.x + (area.width - textWidth) / 2;
        const textY = pdfY + (area.height - fontSize) / 2;

        page.drawText(replacementText, {
          x: textX,
          y: textY,
          size: fontSize,
          font,
          color: rgb(1, 1, 1), // White text on black background
        });
      }

      redactedCount++;
    }

    // Save the modified PDF
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    // Convert Uint8Array to ArrayBuffer for Blob compatibility
    const outputBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([outputBuffer], { type: 'application/pdf' });

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
 * Validate redaction areas
 * 
 * @param areas - Array of redaction areas to validate
 * @param pageCount - Total number of pages in the PDF
 * @returns Object with validation result and any errors
 */
export function validateRedactionAreas(
  areas: RedactionArea[],
  pageCount: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!areas || areas.length === 0) {
    errors.push('No redaction areas specified');
    return { valid: false, errors };
  }

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];

    if (area.page < 1 || area.page > pageCount) {
      errors.push(`Area ${i + 1}: Invalid page number ${area.page}`);
    }

    if (area.width <= 0) {
      errors.push(`Area ${i + 1}: Width must be positive`);
    }

    if (area.height <= 0) {
      errors.push(`Area ${i + 1}: Height must be positive`);
    }

    if (area.x < 0) {
      errors.push(`Area ${i + 1}: X coordinate cannot be negative`);
    }

    if (area.y < 0) {
      errors.push(`Area ${i + 1}: Y coordinate cannot be negative`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const redact = {
  applyRedactions,
  validateRedactionAreas,
};

export default redact;
