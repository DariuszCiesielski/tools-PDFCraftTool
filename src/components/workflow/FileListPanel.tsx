'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
    X,
    FileText,
    Image as ImageIcon,
    File,
    Eye,
    Trash2,
    ChevronUp,
    ChevronDown,
    GripVertical,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FileListPanelProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
    onClose: () => void;
}

/**
 * Get file icon based on file type
 */
function getFileIcon(file: File) {
    const type = file.type;
    if (type.startsWith('image/')) {
        return <ImageIcon className="w-5 h-5 text-blue-500" />;
    }
    if (type === 'application/pdf') {
        return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
}

/**
 * Format file size to human readable string
 */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * File List Panel Component
 * Shows selected files with options to preview, remove, and reorder
 */
export function FileListPanel({ files, onFilesChange, onClose }: FileListPanelProps) {
    const tWorkflow = useTranslations('workflow');

    const [previewFile, setPreviewFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    
    // Track preview URL for cleanup
    const previewUrlRef = useRef<string | null>(null);

    // Cleanup preview URL on unmount
    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
            }
        };
    }, []);

    /**
     * Handle close with cleanup
     */
    const handleClose = useCallback(() => {
        // Clean up preview URL before closing
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        setPreviewUrl(null);
        setPreviewFile(null);
        onClose();
    }, [onClose]);

    /**
     * Remove a file from the list
     */
    const handleRemoveFile = useCallback((index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        onFilesChange(newFiles);
    }, [files, onFilesChange]);

    /**
     * Clear all files
     */
    const handleClearAll = useCallback(() => {
        onFilesChange([]);
    }, [onFilesChange]);

    /**
     * Move file up in the list
     */
    const handleMoveUp = useCallback((index: number) => {
        if (index === 0) return;
        const newFiles = [...files];
        [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
        onFilesChange(newFiles);
    }, [files, onFilesChange]);

    /**
     * Move file down in the list
     */
    const handleMoveDown = useCallback((index: number) => {
        if (index === files.length - 1) return;
        const newFiles = [...files];
        [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
        onFilesChange(newFiles);
    }, [files, onFilesChange]);

    /**
     * Preview a file
     */
    const handlePreview = useCallback((file: File) => {
        // Clean up previous preview URL
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
        }

        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewFile(file);
    }, []);

    /**
     * Close preview
     */
    const closePreview = useCallback(() => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        setPreviewUrl(null);
        setPreviewFile(null);
    }, []);

    /**
     * Drag and drop handlers
     */
    const handleDragStart = useCallback((index: number) => {
        setDragIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;

        const newFiles = [...files];
        const draggedFile = newFiles[dragIndex];
        newFiles.splice(dragIndex, 1);
        newFiles.splice(index, 0, draggedFile);
        onFilesChange(newFiles);
        setDragIndex(index);
    }, [dragIndex, files, onFilesChange]);

    const handleDragEnd = useCallback(() => {
        setDragIndex(null);
    }, []);

    if (files.length === 0) {
        return null;
    }

    return (
        <>
            {/* File List Panel */}
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-[hsl(var(--color-background))] rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--color-border))]">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                            <h3 className="text-lg font-semibold text-[hsl(var(--color-foreground))]">
                                {tWorkflow('selectedFiles') || 'Selected Files'}
                            </h3>
                            <span className="text-sm text-[hsl(var(--color-muted-foreground))] ml-2">
                                ({files.length} {tWorkflow('filesCount') || 'files'})
                            </span>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-1 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                        >
                            <X className="w-5 h-5 text-[hsl(var(--color-muted-foreground))]" />
                        </button>
                    </div>

                    {/* File List */}
                    <div className="flex-1 overflow-auto p-4">
                        <div className="space-y-2">
                            {files.map((file, index) => (
                                <div
                                    key={`${file.name}-${index}`}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                    className={`
                                        flex items-center gap-3 p-3 rounded-lg border
                                        ${dragIndex === index
                                            ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.1)]'
                                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.3)]'
                                        }
                                        hover:border-[hsl(var(--color-primary)/0.5)] transition-colors cursor-grab active:cursor-grabbing
                                    `}
                                >
                                    {/* Drag Handle */}
                                    <div className="text-[hsl(var(--color-muted-foreground))]">
                                        <GripVertical className="w-4 h-4" />
                                    </div>

                                    {/* File Icon */}
                                    <div className="flex-shrink-0">
                                        {getFileIcon(file)}
                                    </div>

                                    {/* File Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                            {formatFileSize(file.size)}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        {/* Move Up */}
                                        <button
                                            onClick={() => handleMoveUp(index)}
                                            disabled={index === 0}
                                            className={`p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors
                                                ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title={tWorkflow('moveUp') || 'Move Up'}
                                        >
                                            <ChevronUp className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                        </button>

                                        {/* Move Down */}
                                        <button
                                            onClick={() => handleMoveDown(index)}
                                            disabled={index === files.length - 1}
                                            className={`p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors
                                                ${index === files.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title={tWorkflow('moveDown') || 'Move Down'}
                                        >
                                            <ChevronDown className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                        </button>

                                        {/* Preview */}
                                        <button
                                            onClick={() => handlePreview(file)}
                                            className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                                            title={tWorkflow('preview') || 'Preview'}
                                        >
                                            <Eye className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                                        </button>

                                        {/* Remove */}
                                        <button
                                            onClick={() => handleRemoveFile(index)}
                                            className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                            title={tWorkflow('removeFile') || 'Remove'}
                                        >
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[hsl(var(--color-border))]">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearAll}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            {tWorkflow('clearAll') || 'Clear All'}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleClose}
                        >
                            {tWorkflow('confirm') || 'Confirm'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            {previewFile && previewUrl && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
                    <div className="bg-[hsl(var(--color-background))] rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] flex flex-col">
                        {/* Preview Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--color-border))]">
                            <div className="flex items-center gap-2">
                                {getFileIcon(previewFile)}
                                <span className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate max-w-[400px]">
                                    {previewFile.name}
                                </span>
                            </div>
                            <button
                                onClick={closePreview}
                                className="p-1 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                            >
                                <X className="w-5 h-5 text-[hsl(var(--color-muted-foreground))]" />
                            </button>
                        </div>

                        {/* Preview Content */}
                        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
                            {previewFile.type.startsWith('image/') ? (
                                <img
                                    src={previewUrl}
                                    alt={previewFile.name}
                                    className="max-w-full max-h-[70vh] object-contain rounded"
                                />
                            ) : previewFile.type === 'application/pdf' ? (
                                <iframe
                                    src={previewUrl}
                                    title={previewFile.name}
                                    className="w-[800px] h-[600px] rounded border border-[hsl(var(--color-border))]"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <File className="w-16 h-16 text-[hsl(var(--color-muted-foreground))] mx-auto mb-4" />
                                    <p className="text-[hsl(var(--color-muted-foreground))]">
                                        {tWorkflow('previewNotAvailable') || 'Preview not available for this file type'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default FileListPanel;
