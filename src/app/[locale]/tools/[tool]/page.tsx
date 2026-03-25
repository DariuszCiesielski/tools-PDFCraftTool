import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getToolById, getAllTools } from '@/config/tools';
import { getToolContent, type Locale } from '@/config/tool-content';
import { ToolPage } from '@/components/tools/ToolPage';
import { MergePDFTool } from '@/components/tools/merge';
import { SplitPDFTool } from '@/components/tools/split';
import { DeletePagesTool } from '@/components/tools/delete';
import { RotatePDFTool } from '@/components/tools/rotate';
import { AddBlankPageTool } from '@/components/tools/add-blank-page';
import { ReversePagesTool } from '@/components/tools/reverse';
import { NUpPDFTool } from '@/components/tools/n-up';
import { AlternateMergeTool } from '@/components/tools/alternate-merge';
import { DividePagesTool } from '@/components/tools/divide';
import { CombineSinglePageTool } from '@/components/tools/combine-single-page';
import { GridCombineTool } from '@/components/tools/grid-combine';
import { PosterizePDFTool } from '@/components/tools/posterize';
import { PDFMultiTool } from '@/components/tools/pdf-multi-tool';
import { AddAttachmentsTool } from '@/components/tools/add-attachments';
import { ExtractAttachmentsTool } from '@/components/tools/extract-attachments';
import { ExtractImagesTool } from '@/components/tools/extract-images';
import { EditAttachmentsTool } from '@/components/tools/edit-attachments';
import { ViewMetadataTool } from '@/components/tools/view-metadata';
import { EditMetadataTool } from '@/components/tools/edit-metadata';
import { PDFsToZipTool } from '@/components/tools/pdf-to-zip';
import { ComparePDFsTool } from '@/components/tools/compare-pdfs';
import { EditPDFTool } from '@/components/tools/edit-pdf';
import { ImageToPDFTool } from '@/components/tools/image-to-pdf';
import { TextToPDFTool } from '@/components/tools/text-to-pdf';
import { PSDToPDFTool } from '@/components/tools/psd-to-pdf';
import { JSONToPDFTool } from '@/components/tools/json-to-pdf';
import { FixPageSizeTool } from '@/components/tools/fix-page-size';
import { CompressPDFTool } from '@/components/tools/compress';
import { SignPDFTool } from '@/components/tools/sign';
import { CropPDFTool } from '@/components/tools/crop';
import { OrganizePDFTool } from '@/components/tools/organize';
import { ExtractPagesTool } from '@/components/tools/extract';
import { BookmarkTool } from '@/components/tools/bookmark';
import { PageNumbersTool } from '@/components/tools/page-numbers';
import { WatermarkTool } from '@/components/tools/watermark';
import { HeaderFooterTool } from '@/components/tools/header-footer';
import { InvertColorsTool } from '@/components/tools/invert-colors';
import { BackgroundColorTool } from '@/components/tools/background-color';
import { StampsTool } from '@/components/tools/stamps';
import { RemoveAnnotationsTool } from '@/components/tools/remove-annotations';
import { FormFillerTool } from '@/components/tools/form-filler';
import { FormCreatorTool } from '@/components/tools/form-creator';
import { RemoveBlankPagesTool } from '@/components/tools/remove-blank-pages';
import { PDFToImageTool } from '@/components/tools/pdf-to-image';
import { PDFToGreyscaleTool } from '@/components/tools/pdf-to-greyscale';
import { PDFToJSONTool } from '@/components/tools/pdf-to-json';
import { OCRPDFTool } from '@/components/tools/ocr';
import { LinearizePDFTool } from '@/components/tools/linearize';
import { PageDimensionsTool } from '@/components/tools/page-dimensions';
import { RemoveRestrictionsTool } from '@/components/tools/remove-restrictions';
import { EncryptPDFTool } from '@/components/tools/encrypt';
import { DecryptPDFTool } from '@/components/tools/decrypt';
import { SanitizePDFTool } from '@/components/tools/sanitize';
import { FindAndRedactTool } from '@/components/tools/find-and-redact';
import { FlattenPDFTool } from '@/components/tools/flatten';
import { RemoveMetadataTool } from '@/components/tools/remove-metadata';
import { ChangePermissionsTool } from '@/components/tools/change-permissions';
import { RepairPDFTool } from '@/components/tools/repair';
import { TableOfContentsTool } from '@/components/tools/table-of-contents';
import { TextColorTool } from '@/components/tools/text-color';
import { PDFToDocxTool } from '@/components/tools/pdf-to-docx';
import { PDFToPptxTool } from '@/components/tools/pdf-to-pptx';
import { PDFToExcelTool } from '@/components/tools/pdf-to-excel';
import { RotateCustomTool } from '@/components/tools/rotate-custom/RotateCustomTool';
import { WordToPDFTool } from '@/components/tools/word-to-pdf';
import { ExcelToPDFTool } from '@/components/tools/excel-to-pdf';
import { PPTXToPDFTool } from '@/components/tools/pptx-to-pdf';
import { XPSToPDFTool } from '@/components/tools/xps-to-pdf';
import { RTFToPDFTool } from '@/components/tools/rtf-to-pdf';
import { EPUBToPDFTool } from '@/components/tools/epub-to-pdf';
import { MOBIToPDFTool } from '@/components/tools/mobi-to-pdf';
import { FB2ToPDFTool } from '@/components/tools/fb2-to-pdf';
import { DJVUToPDFTool } from '@/components/tools/djvu-to-pdf';
import { PDFToSVGTool } from '@/components/tools/pdf-to-svg';
import { PDFToMarkdownTool } from '@/components/tools/pdf-to-markdown';
import { DeskewPDFTool } from '@/components/tools/deskew';
import { PDFBookletTool } from '@/components/tools/pdf-booklet';
import { RasterizePDFTool } from '@/components/tools/rasterize';
import { MarkdownToPDFTool } from '@/components/tools/markdown-to-pdf';
import { EmailToPDFTool } from '@/components/tools/email-to-pdf';
import { CBZToPDFTool } from '@/components/tools/cbz-to-pdf';
import { PDFToPDFATool } from '@/components/tools/pdf-to-pdfa';
import { FontToOutlineTool } from '@/components/tools/font-to-outline';
import { ExtractTablesTool } from '@/components/tools/extract-tables';
import { OCGManagerTool } from '@/components/tools/ocg-manager';
import { PDFReaderTool } from '@/components/tools/pdf-reader';
import { DigitalSignPDFTool } from '@/components/tools/digital-sign';
import { ValidateSignatureTool } from '@/components/tools/validate-signature';
import { generateToolMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateSoftwareApplicationSchema,
  generateFAQPageSchema,
  generateHowToSchema,
  generateWebPageSchema,
  generateBreadcrumbSchema
} from '@/lib/seo/structured-data';
import type { Metadata } from 'next';

  const SUPPORTED_LOCALES: Locale[] = ['en', 'ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'vi'];

interface ToolPageParams {
  params: Promise<{
    locale: string;
    tool: string;
  }>;
}

/**
 * Generate static params for all tool pages
 */
export async function generateStaticParams() {
  const tools = getAllTools();

  return SUPPORTED_LOCALES.flatMap(locale =>
    tools.map(tool => ({
      locale,
      tool: tool.slug,
    }))
  );
}

/**
 * Generate metadata for tool pages
 */
export async function generateMetadata({ params }: ToolPageParams): Promise<Metadata> {
  const { locale: localeParam, tool: toolSlug } = await params;
  const locale = localeParam as Locale;
  const tool = getToolById(toolSlug);
  const t = await getTranslations({ locale, namespace: 'errors' });

  if (!tool) {
    return {
      title: t('toolNotFound'),
    };
  }

  const content = getToolContent(locale, tool.id);

  if (!content) {
    return {
      title: tool.id,
    };
  }

  return generateToolMetadata({
    tool,
    content,
    locale,
    path: `/tools/${toolSlug}`,
  });
}

/**
 * Tool Page Component
 * Renders the appropriate tool interface based on the tool slug
 */
export default async function ToolPageRoute({ params }: ToolPageParams) {
  const { locale: localeParam, tool: toolSlug } = await params;
  const locale = localeParam as Locale;

  // Enable static rendering for this locale - MUST be called before getTranslations
  setRequestLocale(locale);

  const t = await getTranslations();

  // Get tool data
  const tool = getToolById(toolSlug);

  if (!tool) {
    notFound();
  }

  // Get tool content for the locale (falls back to English)
  const content = getToolContent(locale, tool.id);

  if (!content) {
    notFound();
  }

  // Generate structured data
  const toolStructuredData = generateSoftwareApplicationSchema(tool, content, locale);
  const faqStructuredData = content.faq && content.faq.length > 0
    ? generateFAQPageSchema(content.faq)
    : null;
  const howToStructuredData = generateHowToSchema(tool, content, locale);
  const webPageStructuredData = generateWebPageSchema(tool, content, locale);
  const breadcrumbStructuredData = generateBreadcrumbSchema(
    [
      { name: 'Home', path: '' },
      { name: 'Tools', path: '/tools' },
      { name: content.title, path: `/tools/${tool.slug}` },
    ],
    locale
  );

  // Prepare localized content for related tools
  const localizedRelatedTools = tool.relatedTools.reduce((acc, relatedId) => {
    const relatedContent = getToolContent(locale, relatedId);
    if (relatedContent) {
      acc[relatedId] = {
        title: relatedContent.title,
        description: relatedContent.metaDescription
      };
    }
    return acc;
  }, {} as Record<string, { title: string; description: string }>);

  // Render the appropriate tool interface
  const renderToolInterface = () => {
    switch (tool.id) {
      case 'merge-pdf':
        return <MergePDFTool />;
      case 'split-pdf':
        return <SplitPDFTool />;
      case 'delete-pages':
        return <DeletePagesTool />;
      case 'rotate-pdf':
        return <RotatePDFTool />;
      case 'rotate-custom':
        return <RotateCustomTool />;
      case 'add-blank-page':
        return <AddBlankPageTool />;
      case 'reverse-pages':
        return <ReversePagesTool />;
      case 'n-up-pdf':
        return <NUpPDFTool />;
      case 'grid-combine':
        return <GridCombineTool />;
      case 'alternate-merge':
        return <AlternateMergeTool />;
      case 'divide-pages':
        return <DividePagesTool />;
      case 'combine-single-page':
        return <CombineSinglePageTool />;
      case 'posterize-pdf':
        return <PosterizePDFTool />;
      case 'pdf-multi-tool':
        return <PDFMultiTool />;
      case 'add-attachments':
        return <AddAttachmentsTool />;
      case 'extract-attachments':
        return <ExtractAttachmentsTool />;
      case 'extract-images':
        return <ExtractImagesTool />;
      case 'edit-attachments':
        return <EditAttachmentsTool />;
      case 'view-metadata':
        return <ViewMetadataTool />;
      case 'edit-metadata':
        return <EditMetadataTool />;
      case 'pdf-to-zip':
        return <PDFsToZipTool />;
      case 'compare-pdfs':
        return <ComparePDFsTool />;
      case 'edit-pdf':
        return <EditPDFTool />;
      // Convert to PDF tools
      case 'image-to-pdf':
        return <ImageToPDFTool />;
      case 'jpg-to-pdf':
        return <ImageToPDFTool imageType="jpg" />;
      case 'png-to-pdf':
        return <ImageToPDFTool imageType="png" />;
      case 'webp-to-pdf':
        return <ImageToPDFTool imageType="webp" />;
      case 'bmp-to-pdf':
        return <ImageToPDFTool imageType="bmp" />;
      case 'tiff-to-pdf':
        return <ImageToPDFTool imageType="tiff" />;
      case 'svg-to-pdf':
        return <ImageToPDFTool imageType="svg" />;
      case 'heic-to-pdf':
        return <ImageToPDFTool imageType="heic" />;
      case 'psd-to-pdf':
        return <PSDToPDFTool />;
      case 'txt-to-pdf':
        return <TextToPDFTool />;
      case 'json-to-pdf':
        return <JSONToPDFTool />;
      // Optimize & Repair tools
      case 'compress-pdf':
        return <CompressPDFTool />;
      case 'sign-pdf':
        return <SignPDFTool />;
      case 'crop-pdf':
        return <CropPDFTool />;
      case 'fix-page-size':
        return <FixPageSizeTool />;
      case 'organize-pdf':
        return <OrganizePDFTool />;
      case 'extract-pages':
        return <ExtractPagesTool />;
      case 'bookmark':
        return <BookmarkTool />;
      case 'page-numbers':
        return <PageNumbersTool />;
      case 'add-watermark':
        return <WatermarkTool />;
      case 'header-footer':
        return <HeaderFooterTool />;
      case 'invert-colors':
        return <InvertColorsTool />;
      case 'background-color':
        return <BackgroundColorTool />;
      case 'text-color':
        return <TextColorTool />;
      case 'table-of-contents':
        return <TableOfContentsTool />;
      case 'add-stamps':
        return <StampsTool />;
      case 'remove-annotations':
        return <RemoveAnnotationsTool />;
      case 'form-filler':
        return <FormFillerTool />;
      case 'form-creator':
        return <FormCreatorTool />;
      case 'remove-blank-pages':
        return <RemoveBlankPagesTool />;
      case 'pdf-to-jpg':
        return <PDFToImageTool outputFormat="jpg" />;
      case 'pdf-to-png':
        return <PDFToImageTool outputFormat="png" />;
      case 'pdf-to-webp':
        return <PDFToImageTool outputFormat="webp" />;
      case 'pdf-to-bmp':
        return <PDFToImageTool outputFormat="bmp" />;
      case 'pdf-to-tiff':
        return <PDFToImageTool outputFormat="tiff" />;
      case 'pdf-to-svg':
        return <PDFToSVGTool />;
      case 'pdf-to-greyscale':
        return <PDFToGreyscaleTool />;
      case 'pdf-to-json':
        return <PDFToJSONTool />;
      case 'pdf-to-docx':
        return <PDFToDocxTool />;
      case 'pdf-to-pptx':
        return <PDFToPptxTool />;
      case 'pdf-to-excel':
        return <PDFToExcelTool />;
      case 'pdf-to-markdown':
        return <PDFToMarkdownTool />;
      case 'ocr-pdf':
        return <OCRPDFTool />;
      case 'linearize-pdf':
        return <LinearizePDFTool />;
      case 'page-dimensions':
        return <PageDimensionsTool />;
      case 'remove-restrictions':
        return <RemoveRestrictionsTool />;
      case 'repair-pdf':
        return <RepairPDFTool />;
      case 'encrypt-pdf':
        return <EncryptPDFTool />;
      case 'decrypt-pdf':
        return <DecryptPDFTool />;
      case 'sanitize-pdf':
        return <SanitizePDFTool />;
      case 'find-and-redact':
        return <FindAndRedactTool />;
      case 'flatten-pdf':
        return <FlattenPDFTool />;
      case 'remove-metadata':
        return <RemoveMetadataTool />;
      case 'change-permissions':
        return <ChangePermissionsTool />;
      // Office to PDF conversion tools
      case 'word-to-pdf':
        return <WordToPDFTool />;
      case 'excel-to-pdf':
        return <ExcelToPDFTool />;
      case 'pptx-to-pdf':
        return <PPTXToPDFTool />;
      case 'xps-to-pdf':
        return <XPSToPDFTool />;
      case 'rtf-to-pdf':
        return <RTFToPDFTool />;
      case 'epub-to-pdf':
        return <EPUBToPDFTool />;
      case 'mobi-to-pdf':
        return <MOBIToPDFTool />;
      case 'fb2-to-pdf':
        return <FB2ToPDFTool />;
      case 'djvu-to-pdf':
        return <DJVUToPDFTool />;
      // New tools
      case 'deskew-pdf':
        return <DeskewPDFTool />;
      case 'pdf-booklet':
        return <PDFBookletTool />;
      case 'rasterize-pdf':
        return <RasterizePDFTool />;
      case 'markdown-to-pdf':
        return <MarkdownToPDFTool />;
      case 'email-to-pdf':
        return <EmailToPDFTool />;
      case 'cbz-to-pdf':
        return <CBZToPDFTool />;
      case 'pdf-to-pdfa':
        return <PDFToPDFATool />;
      case 'font-to-outline':
        return <FontToOutlineTool />;
      case 'extract-tables':
        return <ExtractTablesTool />;
      case 'ocg-manager':
        return <OCGManagerTool />;
      case 'pdf-reader':
        return <PDFReaderTool />;
      case 'digital-sign-pdf':
        return <DigitalSignPDFTool />;
      case 'validate-signature':
        return <ValidateSignatureTool />;
      // Add more tool cases here as they are implemented
      default:
        return (
          <div className="p-8 text-center text-[hsl(var(--color-muted-foreground))]">
            <p>{t('tools.comingSoon')}</p>
          </div>
        );
    }
  };

  return (
    <>
      {/* Structured Data */}
      <JsonLd data={toolStructuredData} />
      <JsonLd data={webPageStructuredData} />
      <JsonLd data={breadcrumbStructuredData} />
      {faqStructuredData && <JsonLd data={faqStructuredData} />}
      {howToStructuredData && <JsonLd data={howToStructuredData} />}

      {/* Tool Page */}
      <ToolPage
        tool={tool}
        content={content}
        locale={locale}
        localizedRelatedTools={localizedRelatedTools}
      >
        {renderToolInterface()}
      </ToolPage>
    </>
  );
}
