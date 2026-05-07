'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { X, Loader2 } from 'lucide-react';
import { useStudioStore, selectCurrentFile, type StudioToolId } from '@/lib/stores/studioStore';

const CompressPDFTool = dynamic(
  () => import('@/components/tools/compress/CompressPDFTool').then((m) => m.CompressPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const SplitPDFTool = dynamic(
  () => import('@/components/tools/split/SplitPDFTool').then((m) => m.SplitPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const MergePDFTool = dynamic(
  () => import('@/components/tools/merge/MergePDFTool').then((m) => m.MergePDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const RotatePDFTool = dynamic(
  () => import('@/components/tools/rotate/RotatePDFTool').then((m) => m.RotatePDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const PageNumbersTool = dynamic(
  () => import('@/components/tools/page-numbers/PageNumbersTool').then((m) => m.PageNumbersTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const WatermarkTool = dynamic(
  () => import('@/components/tools/watermark/WatermarkTool').then((m) => m.WatermarkTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const EncryptPDFTool = dynamic(
  () => import('@/components/tools/encrypt/EncryptPDFTool').then((m) => m.EncryptPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const OCRPDFTool = dynamic(
  () => import('@/components/tools/ocr/OCRPDFTool').then((m) => m.OCRPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const PDFToDocxTool = dynamic(
  () => import('@/components/tools/pdf-to-docx/PDFToDocxTool').then((m) => m.PDFToDocxTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const PDFToExcelTool = dynamic(
  () => import('@/components/tools/pdf-to-excel/PDFToExcelTool').then((m) => m.PDFToExcelTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const PDFToPptxTool = dynamic(
  () => import('@/components/tools/pdf-to-pptx/PDFToPptxTool').then((m) => m.PDFToPptxTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const WordToPDFTool = dynamic(
  () => import('@/components/tools/word-to-pdf/WordToPDFTool').then((m) => m.WordToPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const ExcelToPDFTool = dynamic(
  () => import('@/components/tools/excel-to-pdf/ExcelToPDFTool').then((m) => m.ExcelToPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const ImageToPDFTool = dynamic(
  () => import('@/components/tools/image-to-pdf/ImageToPDFTool').then((m) => m.ImageToPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const EditMetadataTool = dynamic(
  () => import('@/components/tools/edit-metadata/EditMetadataTool').then((m) => m.EditMetadataTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const ExtractImagesTool = dynamic(
  () => import('@/components/tools/extract-images/ExtractImagesTool').then((m) => m.ExtractImagesTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const SignPDFTool = dynamic(
  () => import('@/components/tools/sign/SignPDFTool').then((m) => m.SignPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

// Wave-2: PDF→PDF page operations
const DeletePagesTool = dynamic(
  () => import('@/components/tools/delete/DeletePagesTool').then((m) => m.DeletePagesTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const OrganizePDFTool = dynamic(
  () => import('@/components/tools/organize/OrganizePDFTool').then((m) => m.OrganizePDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const ExtractPagesTool = dynamic(
  () => import('@/components/tools/extract/ExtractPagesTool').then((m) => m.ExtractPagesTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const CropPDFTool = dynamic(
  () => import('@/components/tools/crop/CropPDFTool').then((m) => m.CropPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const AddBlankPageTool = dynamic(
  () => import('@/components/tools/add-blank-page/AddBlankPageTool').then((m) => m.AddBlankPageTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const NUpPDFTool = dynamic(
  () => import('@/components/tools/n-up/NUpPDFTool').then((m) => m.NUpPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const FlattenPDFTool = dynamic(
  () => import('@/components/tools/flatten/FlattenPDFTool').then((m) => m.FlattenPDFTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const HeaderFooterTool = dynamic(
  () => import('@/components/tools/header-footer/HeaderFooterTool').then((m) => m.HeaderFooterTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const RemoveAnnotationsTool = dynamic(
  () => import('@/components/tools/remove-annotations/RemoveAnnotationsTool').then((m) => m.RemoveAnnotationsTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

const RemoveBlankPagesTool = dynamic(
  () => import('@/components/tools/remove-blank-pages/RemoveBlankPagesTool').then((m) => m.RemoveBlankPagesTool),
  { ssr: false, loading: () => <ToolLoader /> },
);

type SupportedToolId = NonNullable<StudioToolId>;

const SUPPORTED_TOOL_IDS: ReadonlySet<string> = new Set<SupportedToolId>([
  'compress',
  'split',
  'merge',
  'rotate',
  'page-numbers',
  'watermark',
  'encrypt',
  'ocr',
  'pdf-to-docx',
  'pdf-to-excel',
  'pdf-to-pptx',
  'word-to-pdf',
  'excel-to-pdf',
  'image-to-pdf',
  'edit-metadata',
  'extract-images',
  'sign',
  // Wave-2
  'delete',
  'organize',
  'extract',
  'crop',
  'add-blank-page',
  'n-up',
  'flatten',
  'header-footer',
  'remove-annotations',
  'remove-blank-pages',
]);

// Tools that produce a PDF as their primary output. Only these get the onComplete callback
// (which replaces currentFile in studioStore so the viewer shows the result).
// Tools producing non-PDF output (DOCX, XLSX, PPTX, ZIP) keep their built-in DownloadButton.
const PDF_OUTPUT_TOOLS: ReadonlySet<string> = new Set<SupportedToolId>([
  'compress',
  'rotate',
  'page-numbers',
  'watermark',
  'encrypt',
  'sign',
  'edit-metadata',
  'ocr', // ocr only calls onComplete when outputFormat === 'searchable-pdf' (logic in OCRPDFTool)
  // Wave-2: all are PDF→PDF page operations
  'delete',
  'organize',
  'extract',
  'crop',
  'add-blank-page',
  'n-up',
  'flatten',
  'header-footer',
  'remove-annotations',
  'remove-blank-pages',
]);

export function isToolSupportedInDrawer(toolId: StudioToolId): toolId is SupportedToolId {
  return toolId !== null && SUPPORTED_TOOL_IDS.has(toolId);
}

function ToolLoader() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--color-muted-foreground))]" />
    </div>
  );
}

const RESULT_FILENAME_PREFIX: Record<SupportedToolId, string> = {
  compress: 'compressed',
  rotate: 'rotated',
  'page-numbers': 'numbered',
  watermark: 'watermarked',
  encrypt: 'encrypted',
  split: '',
  merge: '',
  ocr: 'ocr',
  sign: 'signed',
  'edit-metadata': 'edited',
  // Non-PDF output (no replaceFileData):
  'pdf-to-docx': '',
  'pdf-to-excel': '',
  'pdf-to-pptx': '',
  'word-to-pdf': '',
  'excel-to-pdf': '',
  'image-to-pdf': '',
  'extract-images': '',
  // Wave-2 PDF→PDF
  delete: 'edited',
  organize: 'reordered',
  extract: 'extracted',
  crop: 'cropped',
  'add-blank-page': 'edited',
  'n-up': 'nup',
  flatten: 'flattened',
  'header-footer': 'with-headers',
  'remove-annotations': 'cleaned',
  'remove-blank-pages': 'cleaned',
};

function renamedFilename(toolId: SupportedToolId, original: string): string {
  const prefix = RESULT_FILENAME_PREFIX[toolId];
  if (!prefix) return original;
  const dot = original.lastIndexOf('.');
  if (dot < 0) return `${prefix}-${original}`;
  return `${prefix}-${original}`;
}

interface RenderToolProps {
  toolId: SupportedToolId;
  initialFile?: File;
  onComplete?: (blob: Blob, originalFile: File) => void;
}

function renderTool({ toolId, initialFile, onComplete }: RenderToolProps) {
  // Tools that operate 1→1 PDF→PDF get prefilled file + onComplete callback (replaces currentFile).
  // Tools that produce non-PDF output (DOCX/XLSX/PPTX/ZIP) get prefilled file but NO onComplete
  // (they keep their built-in DownloadButton).
  // Tools that need non-PDF input (Word/Excel/Image → PDF) keep their own FileUploader.
  // Split (1→N ZIP) and Merge (N→1) keep their own FileUploader too.
  switch (toolId) {
    // PDF→PDF, prefilled + onComplete
    case 'compress':
      return <CompressPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'rotate':
      return <RotatePDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'page-numbers':
      return <PageNumbersTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'watermark':
      return <WatermarkTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'encrypt':
      return <EncryptPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'sign':
      return <SignPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'edit-metadata':
      return <EditMetadataTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'ocr':
      return <OCRPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    // PDF→non-PDF, prefilled but no onComplete (DownloadButton stays)
    case 'pdf-to-docx':
      return <PDFToDocxTool initialFile={initialFile} hideUploader={!!initialFile} />;
    case 'pdf-to-excel':
      return <PDFToExcelTool initialFile={initialFile} hideUploader={!!initialFile} />;
    case 'pdf-to-pptx':
      return <PDFToPptxTool initialFile={initialFile} hideUploader={!!initialFile} />;
    case 'extract-images':
      return <ExtractImagesTool initialFile={initialFile} hideUploader={!!initialFile} />;
    // Non-PDF→PDF, own FileUploader (input is not the current PDF)
    case 'word-to-pdf':
      return <WordToPDFTool />;
    case 'excel-to-pdf':
      return <ExcelToPDFTool />;
    case 'image-to-pdf':
      return <ImageToPDFTool />;
    // Multi-file in/out, own FileUploader
    case 'split':
      return <SplitPDFTool />;
    case 'merge':
      return <MergePDFTool />;
    // Wave-2: PDF→PDF page operations, prefilled + onComplete
    case 'delete':
      return <DeletePagesTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'organize':
      return <OrganizePDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'extract':
      return <ExtractPagesTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'crop':
      return <CropPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'add-blank-page':
      return <AddBlankPageTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'n-up':
      return <NUpPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'flatten':
      return <FlattenPDFTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'header-footer':
      return <HeaderFooterTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'remove-annotations':
      return <RemoveAnnotationsTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
    case 'remove-blank-pages':
      return <RemoveBlankPagesTool initialFile={initialFile} hideUploader={!!initialFile} onComplete={onComplete} />;
  }
}

export function ToolDrawer({ toolId }: { toolId: SupportedToolId }) {
  const t = useTranslations('studio');
  const selectTool = useStudioStore((state) => state.selectTool);
  const currentFile = useStudioStore(selectCurrentFile);
  const replaceFileData = useStudioStore((state) => state.replaceFileData);

  const initialFile = currentFile?.file;
  const fileId = currentFile?.id;

  const handleComplete = fileId && PDF_OUTPUT_TOOLS.has(toolId)
    ? (blob: Blob, original: File) => {
        const newName = renamedFilename(toolId, original.name);
        void replaceFileData(fileId, blob, newName);
        // Stay in drawer so user sees the success state inside ToolComponent;
        // file in studioStore (and viewer) is updated automatically via version bump.
      }
    : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))]">
        <h2 className="text-sm font-semibold truncate">{t(`tools.${toolId}.name`)}</h2>
        <button
          type="button"
          onClick={() => selectTool(null)}
          className="p-1.5 rounded-md hover:bg-[hsl(var(--color-muted))] transition-colors"
          aria-label={t('tools.closeDrawer')}
          title={t('tools.closeDrawer')}
        >
          <X className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {renderTool({ toolId, initialFile, onComplete: handleComplete })}
      </div>
    </div>
  );
}
