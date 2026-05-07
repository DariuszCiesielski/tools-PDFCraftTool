'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { manageOCGLayers, listOCGLayers, type OCGLayer } from '@/lib/pdf/processors/ocg-manager';
import { Layers, Eye, EyeOff, Plus, Trash2, Edit2, RefreshCw } from 'lucide-react';

export interface OCGManagerToolProps {
    className?: string;
  /** Optional initial file (skips upload step when prefilled from Studio) */
  initialFile?: File;
  /** Hide the FileUploader UI when prefilled */
  hideUploader?: boolean;
}

export function OCGManagerTool({ className = '', initialFile, hideUploader }: OCGManagerToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    const [file, setFile] = useState<File | null>(initialFile ?? null);
    const [layers, setLayers] = useState<OCGLayer[]>([]);
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [newLayerName, setNewLayerName] = useState('');
    const [editingLayer, setEditingLayer] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);


    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setLayers([]);
            setResultBlob(null);
            setError(null);
        }
    }, []);

    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    // Load layers when file is selected
    useEffect(() => {
        if (file) {
            loadLayers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);

    const loadLayers = useCallback(async () => {
        if (!file) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await listOCGLayers(file, (prog) => setProgress(prog));
            setLayers(result.layers);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load layers.');
        } finally {
            setIsLoading(false);
        }
    }, [file]);

    const handleToggleLayer = useCallback(async (layerId: string, currentVisible: boolean) => {
        if (!file) return;

        setIsProcessing(true);
        setError(null);

        try {
            const output = await manageOCGLayers(file, {
                action: 'toggle',
                layerId,
                visible: !currentVisible,
            }, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                // Update local state
                setLayers(prev => prev.map(l =>
                    l.id === layerId ? { ...l, visible: !currentVisible } : l
                ));
            } else {
                setError(output.error?.message || 'Failed to toggle layer.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file]);

    const handleAddLayer = useCallback(async () => {
        if (!file || !newLayerName.trim()) return;

        setIsProcessing(true);
        setError(null);

        try {
            const output = await manageOCGLayers(file, {
                action: 'add',
                layerName: newLayerName.trim(),
            }, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                setNewLayerName('');
                // Reload layers
                await loadLayers();
            } else {
                setError(output.error?.message || 'Failed to add layer.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, newLayerName, loadLayers]);

    const handleDeleteLayer = useCallback(async (layerId: string) => {
        if (!file) return;

        if (!confirm('Are you sure you want to delete this layer?')) return;

        setIsProcessing(true);
        setError(null);

        try {
            const output = await manageOCGLayers(file, {
                action: 'delete',
                layerId,
            }, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                setLayers(prev => prev.filter(l => l.id !== layerId));
            } else {
                setError(output.error?.message || 'Failed to delete layer.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file]);

    const handleRenameLayer = useCallback(async (layerId: string) => {
        if (!file || !editName.trim()) return;

        setIsProcessing(true);
        setError(null);

        try {
            const output = await manageOCGLayers(file, {
                action: 'rename',
                layerId,
                layerName: editName.trim(),
            }, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                setLayers(prev => prev.map(l =>
                    l.id === layerId ? { ...l, name: editName.trim() } : l
                ));
                setEditingLayer(null);
                setEditName('');
            } else {
                setError(output.error?.message || 'Failed to rename layer.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, editName]);

    const handleReset = useCallback(() => {
        setFile(null);
        setLayers([]);
        setResultBlob(null);
        setError(null);
        setProgress(0);
    }, []);

    const hasFile = file !== null;
    const hasLayers = layers.length > 0;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {!file && !hideUploader && (
              <FileUploader
                accept={['application/pdf', '.pdf']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('ocgManager.uploadLabel') || 'Upload PDF File'}
                description={tTools('ocgManager.uploadDescription') || 'Drag and drop a PDF to manage its layers (OCG).'}
            />
            )}

            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {hasFile && (
                <Card variant="outlined">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                                {tTools('ocgManager.layersTitle') || 'PDF Layers'} ({layers.length})
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={loadLayers} disabled={isLoading || isProcessing}>
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleReset} disabled={isProcessing}>
                                {t('buttons.clear') || 'Clear'}
                            </Button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="py-8 text-center text-[hsl(var(--color-muted-foreground))]">
                            Loading layers...
                        </div>
                    ) : hasLayers ? (
                        <div className="space-y-2">
                            {layers.map((layer) => (
                                <div
                                    key={layer.id}
                                    className="flex items-center justify-between p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.3)]"
                                >
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleToggleLayer(layer.id, layer.visible)}
                                            disabled={isProcessing}
                                            className="p-1 rounded hover:bg-[hsl(var(--color-muted))]"
                                            title={layer.visible ? 'Hide layer' : 'Show layer'}
                                        >
                                            {layer.visible ? (
                                                <Eye className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <EyeOff className="w-4 h-4 text-gray-400" />
                                            )}
                                        </button>

                                        {editingLayer === layer.id ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleRenameLayer(layer.id)}
                                                className="px-2 py-1 text-sm border rounded"
                                                autoFocus
                                            />
                                        ) : (
                                            <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                                                {layer.name}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {editingLayer === layer.id ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRenameLayer(layer.id)}
                                                    disabled={isProcessing}
                                                >
                                                    Save
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditingLayer(null);
                                                        setEditName('');
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setEditingLayer(layer.id);
                                                        setEditName(layer.name);
                                                    }}
                                                    disabled={isProcessing}
                                                    className="p-1 rounded hover:bg-[hsl(var(--color-muted))]"
                                                    title="Rename layer"
                                                >
                                                    <Edit2 className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLayer(layer.id)}
                                                    disabled={isProcessing}
                                                    className="p-1 rounded hover:bg-red-100"
                                                    title="Delete layer"
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-[hsl(var(--color-muted-foreground))]">
                            {tTools('ocgManager.noLayers') || 'This PDF has no layers (OCG).'}
                        </div>
                    )}

                    {/* Add New Layer */}
                    <div className="mt-4 pt-4 border-t border-[hsl(var(--color-border))]">
                        <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                            {tTools('ocgManager.addLayerLabel') || 'Add New Layer'}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newLayerName}
                                onChange={(e) => setNewLayerName(e.target.value)}
                                placeholder="Layer name..."
                                disabled={isProcessing}
                                className="flex-1 px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] text-sm"
                            />
                            <Button
                                variant="secondary"
                                onClick={handleAddLayer}
                                disabled={isProcessing || !newLayerName.trim()}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Add
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {isProcessing && (
                <ProcessingProgress progress={progress} status="processing" message="Processing layers..." showPercentage />
            )}

            {resultBlob && (
                <div className="flex flex-wrap items-center gap-4">
                    <DownloadButton
                        file={resultBlob}
                        filename={file ? `${file.name.replace(/\.pdf$/i, '')}_layers.pdf` : 'layers.pdf'}
                        variant="primary"
                        size="lg"
                    />
                </div>
            )}

            {resultBlob && (
                <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
                    <p className="text-sm font-medium">{tTools('ocgManager.successMessage') || 'Layer changes saved successfully!'}</p>
                </div>
            )}
        </div>
    );
}

export default OCGManagerTool;
