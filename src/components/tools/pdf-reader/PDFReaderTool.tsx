'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Download, X } from 'lucide-react';

export interface PDFReaderToolProps {
    className?: string;
}

/**
 * PDFReaderTool Component
 * 
 * A simple PDF reader that uses the browser's built-in PDF viewer.
 */
export function PDFReaderTool({ className = '' }: PDFReaderToolProps) {
    const tTools = useTranslations('tools');

    const [file, setFile] = useState<File | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            const selectedFile = files[0];
            setFile(selectedFile);

            // Revoke previous URL
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }

            // Create new URL for the PDF
            const url = URL.createObjectURL(selectedFile);
            setPdfUrl(url);
            setError(null);
        }
    }, [pdfUrl]);

    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    // Cleanup URL on unmount
    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    const handleDownload = useCallback(() => {
        if (pdfUrl && file) {
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }, [pdfUrl, file]);

    const handleReset = useCallback(() => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }
        setFile(null);
        setPdfUrl(null);
        setError(null);
    }, [pdfUrl]);

    const hasFile = file !== null;

    return (
        <div className={`space-y-4 ${className}`.trim()} ref={containerRef}>
            {!hasFile && (
                <FileUploader
                    accept={['application/pdf', '.pdf']}
                    multiple={false}
                    maxFiles={1}
                    onFilesSelected={handleFilesSelected}
                    onError={handleUploadError}
                    label={tTools('pdfReader.uploadLabel') || 'Open PDF File'}
                    description={tTools('pdfReader.uploadDescription') || 'Open a PDF file to read and view.'}
                />
            )}

            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {hasFile && pdfUrl && (
                <>
                    {/* Simple Header with File Info */}
                    <Card variant="outlined" className="!p-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                                    {file.name}
                                </span>
                                <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={handleDownload} title="Download">
                                    <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleReset} title="Close">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* PDF Viewer - Using browser's built-in PDF viewer */}
                    <div
                        className="relative bg-gray-100 rounded-[var(--radius-md)] overflow-hidden"
                        style={{ height: '80vh', minHeight: '600px' }}
                    >
                        <iframe
                            src={pdfUrl}
                            className="w-full h-full absolute inset-0 border-0"
                            title={file.name}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

export default PDFReaderTool;
