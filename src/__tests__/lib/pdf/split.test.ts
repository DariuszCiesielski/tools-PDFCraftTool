/**
 * Unit Tests for Split PDF Processor
 * Requirements: 5.1
 * 
 * Tests various page ranges and split functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SplitPDFProcessor,
  createSplitProcessor,
  parsePageRanges,
  createSplitEveryNPages,
  createSplitEveryPage,
} from '@/lib/pdf/processors/split';
import { PDFErrorCode } from '@/types/pdf';

// Helper to create a real minimal PDF using pdf-lib
async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([612, 792]); // Letter size
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('SplitPDFProcessor', () => {
  let processor: SplitPDFProcessor;

  beforeEach(() => {
    processor = createSplitProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { ranges: [{ start: 1, end: 1 }] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('1 PDF file');
    });

    it('should return error when more than 1 file is provided', async () => {
      const file1 = await createRealPDFFile('doc1.pdf', 3);
      const file2 = await createRealPDFFile('doc2.pdf', 3);

      const result = await processor.process({
        files: [file1, file2],
        options: { ranges: [{ start: 1, end: 1 }] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });

    it('should return error when no page ranges are provided', async () => {
      const file = await createRealPDFFile('doc.pdf', 5);

      const result = await processor.process({
        files: [file],
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('page range');
    });

    it('should return error when empty ranges array is provided', async () => {
      const file = await createRealPDFFile('doc.pdf', 5);

      const result = await processor.process({
        files: [file],
        options: { ranges: [] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });
  });

  describe('getProgress', () => {
    it('should return 0 initially', () => {
      expect(processor.getProgress()).toBe(0);
    });
  });
});

describe('parsePageRanges', () => {
  it('should parse single page number', () => {
    const ranges = parsePageRanges('5', 10);
    expect(ranges).toEqual([{ start: 5, end: 5 }]);
  });

  it('should parse page range with dash', () => {
    const ranges = parsePageRanges('1-5', 10);
    expect(ranges).toEqual([{ start: 1, end: 5 }]);
  });

  it('should parse multiple comma-separated pages', () => {
    const ranges = parsePageRanges('1,3,5', 10);
    expect(ranges).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 5 },
    ]);
  });

  it('should parse mixed ranges and single pages', () => {
    const ranges = parsePageRanges('1-3,5,7-10', 10);
    expect(ranges).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 10 },
    ]);
  });

  it('should handle whitespace in input', () => {
    const ranges = parsePageRanges(' 1 - 3 , 5 , 7 - 10 ', 10);
    expect(ranges).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 10 },
    ]);
  });

  it('should return empty array for empty string', () => {
    const ranges = parsePageRanges('', 10);
    expect(ranges).toEqual([]);
  });

  it('should ignore invalid entries', () => {
    const ranges = parsePageRanges('1,abc,3', 10);
    expect(ranges).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
    ]);
  });

  it('should handle single digit ranges', () => {
    const ranges = parsePageRanges('1-2', 5);
    expect(ranges).toEqual([{ start: 1, end: 2 }]);
  });

  it('should handle ranges at document boundaries', () => {
    const ranges = parsePageRanges('1-10', 10);
    expect(ranges).toEqual([{ start: 1, end: 10 }]);
  });
});

describe('createSplitEveryNPages', () => {
  it('should create ranges for splitting every 2 pages', () => {
    const ranges = createSplitEveryNPages(10, 2);
    expect(ranges).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
      { start: 5, end: 6 },
      { start: 7, end: 8 },
      { start: 9, end: 10 },
    ]);
  });

  it('should handle uneven page counts', () => {
    const ranges = createSplitEveryNPages(7, 3);
    expect(ranges).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 7 },
    ]);
  });

  it('should handle splitting every 1 page', () => {
    const ranges = createSplitEveryNPages(3, 1);
    expect(ranges).toEqual([
      { start: 1, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 3 },
    ]);
  });

  it('should handle n larger than total pages', () => {
    const ranges = createSplitEveryNPages(3, 10);
    expect(ranges).toEqual([{ start: 1, end: 3 }]);
  });

  it('should handle splitting every 5 pages', () => {
    const ranges = createSplitEveryNPages(12, 5);
    expect(ranges).toEqual([
      { start: 1, end: 5 },
      { start: 6, end: 10 },
      { start: 11, end: 12 },
    ]);
  });

  it('should handle exact division', () => {
    const ranges = createSplitEveryNPages(9, 3);
    expect(ranges).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 9 },
    ]);
  });
});

describe('createSplitEveryPage', () => {
  it('should create individual page ranges', () => {
    const ranges = createSplitEveryPage(5);
    expect(ranges).toEqual([
      { start: 1, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 3 },
      { start: 4, end: 4 },
      { start: 5, end: 5 },
    ]);
  });

  it('should handle single page document', () => {
    const ranges = createSplitEveryPage(1);
    expect(ranges).toEqual([{ start: 1, end: 1 }]);
  });

  it('should handle large document', () => {
    const ranges = createSplitEveryPage(100);
    expect(ranges).toHaveLength(100);
    expect(ranges[0]).toEqual({ start: 1, end: 1 });
    expect(ranges[99]).toEqual({ start: 100, end: 100 });
  });
});

describe('createSplitProcessor factory', () => {
  it('should create a new SplitPDFProcessor instance', () => {
    const processor = createSplitProcessor();
    expect(processor).toBeInstanceOf(SplitPDFProcessor);
  });

  it('should create independent instances', () => {
    const processor1 = createSplitProcessor();
    const processor2 = createSplitProcessor();
    expect(processor1).not.toBe(processor2);
  });
});
