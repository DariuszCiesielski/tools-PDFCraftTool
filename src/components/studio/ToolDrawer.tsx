'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { X, Loader2 } from 'lucide-react';
import { useStudioStore, type StudioToolId } from '@/lib/stores/studioStore';

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

type SupportedToolId = NonNullable<StudioToolId>;

const SUPPORTED_TOOL_IDS: ReadonlySet<string> = new Set<SupportedToolId>([
  'compress',
  'split',
  'merge',
  'rotate',
  'page-numbers',
  'watermark',
  'encrypt',
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

function renderTool(toolId: SupportedToolId) {
  switch (toolId) {
    case 'compress':
      return <CompressPDFTool />;
    case 'split':
      return <SplitPDFTool />;
    case 'merge':
      return <MergePDFTool />;
    case 'rotate':
      return <RotatePDFTool />;
    case 'page-numbers':
      return <PageNumbersTool />;
    case 'watermark':
      return <WatermarkTool />;
    case 'encrypt':
      return <EncryptPDFTool />;
  }
}

export function ToolDrawer({ toolId }: { toolId: SupportedToolId }) {
  const t = useTranslations('studio');
  const selectTool = useStudioStore((state) => state.selectTool);

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
      <div className="flex-1 overflow-y-auto p-4">{renderTool(toolId)}</div>
    </div>
  );
}
