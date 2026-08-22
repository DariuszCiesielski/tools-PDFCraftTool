'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { WorkflowExecutionState, WorkflowNode, WorkflowEdge, WorkflowValidation } from '@/types/workflow';
import { Button } from '@/components/ui/Button';
import { FileListPanel } from './FileListPanel';
import {
    Play,
    Square,
    Download,
    Save,
    Upload,
    Trash2,
    AlertCircle,
    CheckCircle,
    XCircle,
    Loader2,
    Edit2,
    RefreshCcw,
    RotateCcw,
} from 'lucide-react';

interface WorkflowControlsProps {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    executionState: WorkflowExecutionState;
    validation: WorkflowValidation;
    onExecute: (files: File[]) => void;
    onStop: () => void;
    onSave: (name: string, description?: string) => void;
    onClear: () => void;
    onClearState?: () => void;
    onRetry?: () => void;
    onImport: (file: File) => void;
    onFilesChange?: (files: File[]) => void;
}

/**
 * Workflow Controls Toolbar
 * Provides execution, save, load, and validation controls
 */
export function WorkflowControls({
    nodes,
    edges: _edges,
    executionState,
    validation,
    onExecute,
    onStop,
    onSave,
    onClear,
    onClearState,
    onRetry,
    onImport,
    onFilesChange,
}: WorkflowControlsProps) {
    const tWorkflow = useTranslations('workflow');
    const tCommon = useTranslations('common');

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showFileListPanel, setShowFileListPanel] = useState(false);
    const [workflowName, setWorkflowName] = useState('');
    const [workflowDescription, setWorkflowDescription] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setSelectedFiles(files);
        onFilesChange?.(files);
    }, [onFilesChange]);

    const handleExecute = useCallback(() => {
        if (selectedFiles.length > 0) {
            Promise.resolve(onExecute(selectedFiles)).catch((err) => {
                console.error('[Workflow] Unhandled execution error:', err);
            });
        }
    }, [selectedFiles, onExecute]);

    const handleSave = useCallback(() => {
        if (workflowName.trim()) {
            onSave(workflowName.trim(), workflowDescription.trim() || undefined);
            setShowSaveDialog(false);
            setWorkflowName('');
            setWorkflowDescription('');
        }
    }, [workflowName, workflowDescription, onSave]);

    const handleImportClick = useCallback(() => {
        importInputRef.current?.click();
    }, []);

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImport(file);
            e.target.value = '';
        }
    }, [onImport]);

    const isRunning = executionState.status === 'running';
    const canExecute = nodes.length > 0 && selectedFiles.length > 0 && validation.isValid && !isRunning;

    // Status indicator
    const StatusIndicator = () => {
        if (executionState.status === 'running') {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">
                        {tWorkflow('running') || 'Running'} ({executionState.progress}%)
                    </span>
                </div>
            );
        }
        if (executionState.status === 'complete') {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{tWorkflow('complete') || 'Complete'}</span>
                </div>
            );
        }
        if (executionState.status === 'error') {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{tWorkflow('error') || 'Error'}</span>
                </div>
            );
        }
        if (!validation.isValid) {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                        {validation.errors.length} {tWorkflow('issues') || 'issues'}
                    </span>
                </div>
            );
        }
        return null;
    };

    return (
        <>
            <div className="flex items-center justify-between px-4 py-3 bg-[hsl(var(--color-background))] border-b border-[hsl(var(--color-border))]">
                {/* Left: File input and execute */}
                <div className="flex items-center gap-3">
                    {/* File selection */}
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.svg,.heic,.heif,.txt,.json,.md,.markdown,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.epub,.mobi,.azw,.azw3,.xps,.djvu,.djv,.fb2,.cbz,.zip,.eml,.msg"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isRunning}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {tWorkflow('selectFiles') || 'Select Files'}
                        </Button>
                        {selectedFiles.length > 0 && (
                            <button
                                onClick={() => setShowFileListPanel(true)}
                                disabled={isRunning}
                                className={`
                                    flex items-center gap-2 px-3 py-1.5 rounded-lg 
                                    bg-[hsl(var(--color-primary)/0.1)] 
                                    text-[hsl(var(--color-primary))]
                                    hover:bg-[hsl(var(--color-primary)/0.2)]
                                    transition-colors
                                    ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                title={tWorkflow('viewEditFiles') || 'View/Edit Files'}
                            >
                                <span className="text-sm font-medium">
                                    {selectedFiles.length} {tWorkflow('filesSelected') || 'files selected'}
                                </span>
                                <Edit2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Execute button */}
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExecute}
                        disabled={!canExecute}
                        loading={isRunning}
                    >
                        <Play className="w-4 h-4 mr-2" />
                        {tWorkflow('execute') || 'Execute'}
                    </Button>

                    {/* Stop button */}
                    {isRunning && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onStop}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                            <Square className="w-4 h-4 mr-2" />
                            {tWorkflow('stop') || 'Stop'}
                        </Button>
                    )}

                    {/* Status */}
                    <StatusIndicator />
                </div>

                {/* Right: Save, Import, Clear */}
                <div className="flex items-center gap-2">
                    {/* Node count */}
                    <span className="text-sm text-[hsl(var(--color-muted-foreground))] mr-2">
                        {nodes.length} {tWorkflow('nodes') || 'nodes'}
                    </span>

                    {/* Save */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSaveDialog(true)}
                        disabled={nodes.length === 0}
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {tCommon('buttons.save') || 'Save'}
                    </Button>

                    {/* Import */}
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,.workflow.json"
                        onChange={handleImportFile}
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImportClick}
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {tWorkflow('import') || 'Import'}
                    </Button>

                    {/* Clear */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={nodes.length === 0 || isRunning}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {tWorkflow('clear') || 'Clear'}
                    </Button>
                </div>
            </div>

            {/* Download output button */}
            {executionState.status === 'complete' && executionState.outputFiles && executionState.outputFiles.length > 0 && (
                <div className="px-4 py-2 bg-green-50 border-b border-green-200">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">
                            {tWorkflow('workflowComplete') || 'Workflow completed successfully!'}
                        </span>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                executionState.outputFiles?.forEach((item, index) => {
                                    let blob: Blob;
                                    let filename: string;

                                    if (item instanceof Blob) {
                                        blob = item;
                                        filename = `output_${index + 1}.pdf`;
                                    } else {
                                        blob = item.blob;
                                        filename = item.filename || `output_${index + 1}.pdf`;
                                    }

                                    // Create URL for download
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    
                                    // Cleanup URL immediately after download
                                    setTimeout(() => URL.revokeObjectURL(url), 100);
                                });
                            }}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {tWorkflow('downloadResults') || 'Download Results'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Execution error with retry option */}
            {executionState.status === 'error' && executionState.error && (
                <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1">
                            <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-700 mb-1">
                                    {tWorkflow('executionFailed') || 'Workflow execution failed'}
                                </p>
                                <p className="text-sm text-red-600 whitespace-pre-wrap">
                                    {executionState.error.message}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {onRetry && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onRetry}
                                    className="text-red-600 border-red-300 hover:bg-red-100"
                                >
                                    <RefreshCcw className="w-4 h-4 mr-2" />
                                    {tWorkflow('retry') || 'Retry'}
                                </Button>
                            )}
                            {onClearState && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClearState}
                                    className="text-red-600 hover:bg-red-100"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    {tWorkflow('reset') || 'Reset'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Validation errors */}
            {validation.errors.length > 0 && !isRunning && executionState.status !== 'error' && (
                <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-700">
                            <p className="font-semibold mb-1">{tWorkflow('validationErrors') || 'Validation Errors'}</p>
                            {validation.errors.map((error, index) => (
                                <p key={index} className="ml-2">- {error.message}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Validation warnings */}
            {validation.warnings.length > 0 && !isRunning && executionState.status !== 'error' && (
                <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-600">
                            <p className="font-semibold mb-1">{tWorkflow('warnings') || 'Warnings'}</p>
                            {validation.warnings.map((warning, index) => (
                                <p key={index} className="ml-2">- {warning.message}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[hsl(var(--color-background))] rounded-lg shadow-xl p-6 w-[400px]">
                        <h3 className="text-lg font-semibold text-[hsl(var(--color-foreground))] mb-4">
                            {tWorkflow('saveWorkflow') || 'Save Workflow'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                    {tWorkflow('workflowName') || 'Workflow Name'}
                                </label>
                                <input
                                    type="text"
                                    value={workflowName}
                                    onChange={(e) => setWorkflowName(e.target.value)}
                                    placeholder={tWorkflow('enterName') || 'Enter workflow name...'}
                                    className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                    {tWorkflow('description') || 'Description'} ({tWorkflow('optional') || 'optional'})
                                </label>
                                <textarea
                                    value={workflowDescription}
                                    onChange={(e) => setWorkflowDescription(e.target.value)}
                                    placeholder={tWorkflow('enterDescription') || 'Enter description...'}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                variant="ghost"
                                onClick={() => setShowSaveDialog(false)}
                            >
                                {tCommon('buttons.cancel') || 'Cancel'}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                disabled={!workflowName.trim()}
                            >
                                {tCommon('buttons.save') || 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* File List Panel */}
            {showFileListPanel && (
                <FileListPanel
                    files={selectedFiles}
                    onFilesChange={(files) => {
                        setSelectedFiles(files);
                        onFilesChange?.(files);
                    }}
                    onClose={() => setShowFileListPanel(false)}
                />
            )}
        </>
    );
}

export default WorkflowControls;
