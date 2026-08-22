'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/utils/logger';
import { workflowTemplates } from '@/config/workflow-templates';
import { WorkflowTemplate, SavedWorkflow } from '@/types/workflow';
import { WorkflowHistory } from './WorkflowHistory';
import type { WorkflowExecutionRecord } from '@/types/workflow-history';
import {
    FileStack,
    Clock,
    Star,
    Trash2,
    Download,
    Copy,
    FolderOpen,
    Sparkles,
    Shield,
    Zap,
    RefreshCw,
    PanelRightClose,
    PanelRightOpen
} from 'lucide-react';

interface WorkflowLibraryProps {
    savedWorkflows: SavedWorkflow[];
    onLoadTemplate: (template: WorkflowTemplate) => void;
    onLoadWorkflow: (workflow: SavedWorkflow) => void;
    onDeleteWorkflow: (id: string) => void;
    onDuplicateWorkflow: (id: string) => void;
    onExportWorkflow: (workflow: SavedWorkflow) => void;
    onLoadFromHistory?: (record: WorkflowExecutionRecord) => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

type TabType = 'templates' | 'saved' | 'favorites' | 'history';

/**
 * Workflow Library Panel
 * Displays templates and saved workflows
 */
export function WorkflowLibrary({
    savedWorkflows,
    onLoadTemplate,
    onLoadWorkflow,
    onDeleteWorkflow,
    onDuplicateWorkflow,
    onExportWorkflow,
    onLoadFromHistory,
    isCollapsed = false,
    onToggleCollapse,
}: WorkflowLibraryProps) {
    const tWorkflow = useTranslations('workflow');
    const [activeTab, setActiveTab] = useState<TabType>('templates');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Template ID to translation key mapping
    const templateKeyMap: Record<string, string> = {
        'merge-compress': 'mergeCompress',
        'images-to-pdf-watermark': 'imagesToWatermarkedPdf',
        'pdf-to-images-compress': 'pdfToImages',
        'secure-pdf': 'securePdf',
        'document-prep': 'documentPrep',
        'optimize-for-web': 'optimizeForWeb',
        'split-and-watermark': 'splitAndWatermark',
        'office-to-pdf-merge': 'officeToMergedPdf',
        'rotate-and-number': 'rotateAndNumber',
        'print-ready': 'printReady',
        'grayscale-compress': 'grayscaleCompress',
        'extract-and-merge': 'extractAndMerge',
        'confidential-document': 'confidentialDocument',
        'pdf-to-docx-cleanup': 'pdfToEditableDoc',
        'comprehensive-optimization': 'fullOptimization',
        'pdf-to-presentation': 'pdfToPresentation',
        'unlock-and-edit': 'unlockAndEdit',
        'crop-and-resize': 'cropAndResize',
        'ebook-convert': 'ebookConvert',
        'batch-watermark': 'batchWatermark',
        'archive-prep': 'archivePrep',
        'report-assembly': 'reportAssembly',
        'invoice-processing': 'invoiceProcessing',
        'photo-album': 'photoAlbum',
    };

    // Get translated template name
    const getTemplateName = (template: WorkflowTemplate): string => {
        const key = templateKeyMap[template.id];
        if (key) {
            try {
                // Use a safer way to check if translation exists
                const fullKey = `workflowTemplates.${key}.name`;
                const translated = tWorkflow(fullKey);
                // next-intl returns the key itself if translation is missing in some configs
                if (translated && translated !== fullKey && !translated.includes('workflowTemplates.')) {
                    return translated;
                }
            } catch {
                logger.warn(`Translation missing for template name: ${template.id}`);
            }
        }
        return template.name;
    };

    // Get translated template description
    const getTemplateDescription = (template: WorkflowTemplate): string => {
        const key = templateKeyMap[template.id];
        if (key) {
            try {
                const fullKey = `workflowTemplates.${key}.description`;
                const translated = tWorkflow(fullKey);
                if (translated && translated !== fullKey && !translated.includes('workflowTemplates.')) {
                    return translated;
                }
            } catch {
                logger.warn(`Translation missing for template description: ${template.id}`);
            }
        }
        return template.description;
    };

    const tabs = [
        { id: 'templates' as const, label: tWorkflow('templates') || 'Templates', icon: Sparkles },
        { id: 'saved' as const, label: tWorkflow('saved') || 'Saved', icon: FolderOpen },
        { id: 'favorites' as const, label: tWorkflow('favorites') || 'Favorites', icon: Star },
        { id: 'history' as const, label: tWorkflow('history') || 'History', icon: Clock },
    ];

    const templateCategories = [
        { id: 'all', label: tWorkflow('allCategories') || 'All', icon: FileStack },
        { id: 'common', label: tWorkflow('common') || 'Common', icon: Clock },
        { id: 'conversion', label: tWorkflow('conversion') || 'Conversion', icon: RefreshCw },
        { id: 'optimization', label: tWorkflow('optimization') || 'Optimization', icon: Zap },
        { id: 'security', label: tWorkflow('security') || 'Security', icon: Shield },
    ];

    const filteredTemplates = selectedCategory === 'all'
        ? workflowTemplates
        : workflowTemplates.filter(t => t.category === selectedCategory);

    const favoriteWorkflows = savedWorkflows.filter(w => w.isFavorite);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Collapsed view
    if (isCollapsed) {
        return (
            <div className="w-12 h-full bg-[hsl(var(--color-background))] border-l border-[hsl(var(--color-border))] flex flex-col items-center py-2">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors mb-2"
                    title={tWorkflow('templates') || 'Templates'}
                >
                    <PanelRightOpen className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                </button>
                <div className="w-8 h-px bg-[hsl(var(--color-border))] mb-2" />
                {/* Show tab icons when collapsed */}
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={onToggleCollapse}
                            className="p-2 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors mb-1"
                            title={tab.label}
                        >
                            <Icon className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="w-80 h-full bg-[hsl(var(--color-background))] border-l border-[hsl(var(--color-border))] flex flex-col">
            {/* Collapse button header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--color-border))]">
                <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                    {tWorkflow('templates') || 'Library'}
                </span>
                <button
                    onClick={onToggleCollapse}
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--color-muted))] transition-colors"
                    title="Collapse sidebar"
                >
                    <PanelRightClose className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[hsl(var(--color-border))]">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors
                ${activeTab === tab.id
                                    ? 'text-[hsl(var(--color-primary))] border-b-2 border-[hsl(var(--color-primary))]'
                                    : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                                }
              `}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Templates Tab */}
                {activeTab === 'templates' && (
                    <div className="p-4">
                        {/* Category Filter */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {templateCategories.map(cat => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors
                      ${selectedCategory === cat.id
                                                ? 'bg-[hsl(var(--color-primary))] text-white'
                                                : 'bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted)/0.8)]'
                                            }
                    `}
                                    >
                                        <Icon className="w-3 h-3" />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Templates List */}
                        <div className="space-y-3">
                            {filteredTemplates.map(template => (
                                <div
                                    key={template.id}
                                    className="p-3 rounded-lg border border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.5)] hover:shadow-md transition-all cursor-pointer group"
                                    onClick={() => onLoadTemplate(template)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-medium text-[hsl(var(--color-foreground))] group-hover:text-[hsl(var(--color-primary))]">
                                                {getTemplateName(template)}
                                            </h4>
                                            <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1 line-clamp-2">
                                                {getTemplateDescription(template)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-[10px] px-2 py-0.5 bg-[hsl(var(--color-muted))] rounded-full text-[hsl(var(--color-muted-foreground))]">
                                            {template.nodes.length} {tWorkflow('nodes') || 'nodes'}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 bg-[hsl(var(--color-muted))] rounded-full text-[hsl(var(--color-muted-foreground))]">
                                            {template.edges.length} {tWorkflow('connections') || 'connections'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Saved Tab */}
                {activeTab === 'saved' && (
                    <div className="p-4">
                        {savedWorkflows.length === 0 ? (
                            <div className="text-center py-8">
                                <FolderOpen className="w-12 h-12 mx-auto text-[hsl(var(--color-muted-foreground))]" />
                                <p className="mt-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                                    {tWorkflow('noSavedWorkflows') || 'No saved workflows yet'}
                                </p>
                                <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                                    {tWorkflow('saveWorkflowHint') || 'Create and save your first workflow'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {savedWorkflows.map(workflow => (
                                    <div
                                        key={workflow.id}
                                        className="p-3 rounded-lg border border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.5)] transition-all group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div
                                                className="flex-1 cursor-pointer"
                                                onClick={() => onLoadWorkflow(workflow)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-medium text-[hsl(var(--color-foreground))] group-hover:text-[hsl(var(--color-primary))]">
                                                        {workflow.name}
                                                    </h4>
                                                    {workflow.isFavorite && (
                                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                                    )}
                                                </div>
                                                {workflow.description && (
                                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1 line-clamp-1">
                                                        {workflow.description}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-[hsl(var(--color-muted-foreground))] mt-1">
                                                    {formatDate(workflow.updatedAt)}
                                                </p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDuplicateWorkflow(workflow.id);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                                                    title="Duplicate"
                                                >
                                                    <Copy className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onExportWorkflow(workflow);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
                                                    title="Export"
                                                >
                                                    <Download className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteWorkflow(workflow.id);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-red-100 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Favorites Tab */}
                {activeTab === 'favorites' && (
                    <div className="p-4">
                        {favoriteWorkflows.length === 0 ? (
                            <div className="text-center py-8">
                                <Star className="w-12 h-12 mx-auto text-[hsl(var(--color-muted-foreground))]" />
                                <p className="mt-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                                    {tWorkflow('noFavorites') || 'No favorite workflows'}
                                </p>
                                <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                                    {tWorkflow('favoriteHint') || 'Star workflows to add them here'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {favoriteWorkflows.map(workflow => (
                                    <div
                                        key={workflow.id}
                                        className="p-3 rounded-lg border border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.5)] transition-all cursor-pointer group"
                                        onClick={() => onLoadWorkflow(workflow)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                            <h4 className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                                                {workflow.name}
                                            </h4>
                                        </div>
                                        <p className="text-[10px] text-[hsl(var(--color-muted-foreground))] mt-1">
                                            {formatDate(workflow.updatedAt)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <WorkflowHistory onLoadFromHistory={onLoadFromHistory} />
                )}
            </div>
        </div>
    );
}

export default WorkflowLibrary;
