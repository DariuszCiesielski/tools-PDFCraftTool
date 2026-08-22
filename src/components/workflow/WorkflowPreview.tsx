'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { Eye, EyeOff, X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

interface WorkflowPreviewProps {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    inputFiles: File[];
    isVisible: boolean;
    onToggle: () => void;
}

interface PreviewPage {
    pageNumber: number;
    thumbnail: string;
    source: string;
}

/**
 * Real-time Preview Component
 * Shows a preview of how the PDF will look after the workflow is applied
 */
export function WorkflowPreview({ nodes, edges, inputFiles, isVisible, onToggle }: WorkflowPreviewProps) {
    const tWorkflow = useTranslations('workflow');
    const [previews, setPreviews] = useState<PreviewPage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedPageIndex, setSelectedPageIndex] = useState(0);
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Generate preview when inputs or nodes change
    useEffect(() => {
        if (!isVisible || inputFiles.length === 0) {
            setPreviews([]);
            return;
        }

        generatePreview();
    }, [isVisible, inputFiles, nodes, edges]);

    const generatePreview = async () => {
        if (inputFiles.length === 0) return;

        setIsLoading(true);

        try {
            const newPreviews: PreviewPage[] = [];

            // Generate previews for input PDF files
            for (const file of inputFiles) {
                if (file.type === 'application/pdf') {
                    const pdfjsLib = await import('pdfjs-dist');
                    const { configurePdfjsWorker } = await import('@/lib/pdf/loader');
                    configurePdfjsWorker(pdfjsLib);

                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                    // Preview first 4 pages max
                    const maxPages = Math.min(pdf.numPages, 4);

                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 1.5 });

                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');

                        if (context) {
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;

                            await page.render({
                                canvasContext: context,
                                viewport: viewport,
                            }).promise;

                            // Apply visual effects based on workflow nodes
                            applyNodeEffectsToCanvas(context, canvas, nodes);

                            newPreviews.push({
                                pageNumber: i,
                                thumbnail: canvas.toDataURL('image/png'),
                                source: file.name,
                            });
                        }
                    }
                } else if (file.type.startsWith('image/')) {
                    // For image inputs, create a preview
                    const url = URL.createObjectURL(file);
                    newPreviews.push({
                        pageNumber: 1,
                        thumbnail: url,
                        source: file.name,
                    });
                }
            }

            setPreviews(newPreviews);
        } catch (error) {
            console.error('Failed to generate preview:', error);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Apply visual effects to canvas based on workflow nodes
     * This is a simplified simulation of what the actual processing would do
     */
    const applyNodeEffectsToCanvas = (
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        workflowNodes: WorkflowNode[]
    ) => {
        workflowNodes.forEach(node => {
            const { toolId, settings } = node.data;

            switch (toolId) {
                case 'add-watermark': {
                    const text = (settings?.text as string) || 'WATERMARK';
                    const fontSize = (settings?.fontSize as number) || 48;
                    const opacity = ((settings?.opacity as number) || 30) / 100;
                    const color = (settings?.color as string) || '#888888';
                    const rotation = (settings?.rotation as number) || -45;

                    ctx.save();
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate((rotation * Math.PI) / 180);
                    ctx.globalAlpha = opacity;
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 0, 0);
                    ctx.restore();
                    break;
                }

                case 'pdf-to-greyscale':
                case 'grayscale': {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                        data[i] = gray;
                        data[i + 1] = gray;
                        data[i + 2] = gray;
                    }
                    ctx.putImageData(imageData, 0, 0);
                    break;
                }

                case 'invert-colors': {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = 255 - data[i];
                        data[i + 1] = 255 - data[i + 1];
                        data[i + 2] = 255 - data[i + 2];
                    }
                    ctx.putImageData(imageData, 0, 0);
                    break;
                }

                case 'page-numbers': {
                    const position = (settings?.position as string) || 'bottom-center';
                    const format = (settings?.format as string) || 'number';
                    const startNum = (settings?.startNumber as number) || 1;
                    const fontSizeNum = (settings?.fontSize as number) || 12;

                    ctx.save();
                    ctx.font = `${fontSizeNum * 2}px Arial`;
                    ctx.fillStyle = '#333333';

                    let text = format === 'total' ? `Page ${startNum} of 4` : `${startNum}`;
                    if (format === 'roman') {
                        const romanNumerals = ['I', 'II', 'III', 'IV', 'V'];
                        text = romanNumerals[startNum - 1] || startNum.toString();
                    }

                    const textWidth = ctx.measureText(text).width;
                    let x = canvas.width / 2 - textWidth / 2;
                    let y = canvas.height - 20;

                    if (position.includes('top')) y = 30;
                    if (position.includes('left')) x = 20;
                    if (position.includes('right')) x = canvas.width - textWidth - 20;

                    ctx.fillText(text, x, y);
                    ctx.restore();
                    break;
                }

                case 'compress-pdf': {
                    // Show a visual indicator of compression
                    ctx.save();
                    ctx.globalAlpha = 0.1;
                    ctx.fillStyle = '#00ff00';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.restore();
                    break;
                }
            }
        });
    };

    if (!isVisible) {
        return (
            <button
                onClick={onToggle}
                className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-2 bg-[hsl(var(--color-primary))] text-white rounded-lg shadow-lg hover:bg-[hsl(var(--color-primary)/0.9)] transition-colors"
            >
                <Eye className="w-4 h-4" />
                {tWorkflow('showPreview') || 'Show Preview'}
            </button>
        );
    }

    return (
        <div
            ref={previewContainerRef}
            className={`
        fixed z-40 bg-[hsl(var(--color-background))] border border-[hsl(var(--color-border))] rounded-lg shadow-2xl
        transition-all duration-300
        ${isExpanded
                    ? 'inset-4'
                    : 'bottom-4 right-4 w-80 h-96'
                }
      `}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.3)] rounded-t-lg">
                <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                    <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                        {tWorkflow('preview') || 'Preview'}
                    </span>
                    {isLoading && (
                        <RefreshCw className="w-3 h-3 text-[hsl(var(--color-muted-foreground))] animate-spin" />
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => generatePreview()}
                        className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                        title="Refresh preview"
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                    >
                        {isExpanded
                            ? <Minimize2 className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                            : <Maximize2 className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                        }
                    </button>
                    <button
                        onClick={onToggle}
                        className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                    >
                        <X className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden" style={{ height: isExpanded ? 'calc(100% - 44px)' : 'calc(100% - 44px)' }}>
                {inputFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                        <EyeOff className="w-12 h-12 text-[hsl(var(--color-muted-foreground))] opacity-50" />
                        <p className="mt-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                            {tWorkflow('noFilesForPreview') || 'Select files to see preview'}
                        </p>
                    </div>
                ) : isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-8 h-8 border-3 border-[hsl(var(--color-primary))] border-t-transparent rounded-full animate-spin" />
                        <p className="mt-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                            {tWorkflow('generatingPreview') || 'Generating preview...'}
                        </p>
                    </div>
                ) : previews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                        <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                            {tWorkflow('noPreviewAvailable') || 'No preview available'}
                        </p>
                    </div>
                ) : (
                    <div className="flex h-full">
                        {/* Thumbnails sidebar */}
                        <div className="w-20 border-r border-[hsl(var(--color-border))] overflow-y-auto p-2 space-y-2">
                            {previews.map((preview, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedPageIndex(index)}
                                    className={`
                    w-full aspect-[3/4] rounded overflow-hidden border-2 transition-all
                    ${index === selectedPageIndex
                                            ? 'border-[hsl(var(--color-primary))] ring-2 ring-[hsl(var(--color-primary)/0.3)]'
                                            : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.5)]'
                                        }
                  `}
                                >
                                    <img
                                        src={preview.thumbnail}
                                        alt={`Page ${preview.pageNumber}`}
                                        className="w-full h-full object-cover"
                                    />
                                </button>
                            ))}
                        </div>

                        {/* Main preview */}
                        <div className="flex-1 flex items-center justify-center p-4 bg-[hsl(var(--color-muted)/0.2)]">
                            {previews[selectedPageIndex] && (
                                <img
                                    src={previews[selectedPageIndex].thumbnail}
                                    alt={`Preview page ${previews[selectedPageIndex].pageNumber}`}
                                    className="max-w-full max-h-full object-contain rounded shadow-lg"
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default WorkflowPreview;
