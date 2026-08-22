/**
 * Undo/Redo Hook for Workflow Editor
 * Provides history management for workflow state
 */

import { useState, useCallback, useRef } from 'react';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';

interface HistoryState {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

interface UseUndoRedoReturn {
    /** Current history index */
    historyIndex: number;
    /** Total history length */
    historyLength: number;
    /** Whether undo is available */
    canUndo: boolean;
    /** Whether redo is available */
    canRedo: boolean;
    /** Push current state to history */
    pushHistory: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
    /** Undo last action */
    undo: () => HistoryState | null;
    /** Redo last undone action */
    redo: () => HistoryState | null;
    /** Clear history */
    clearHistory: () => void;
}

const MAX_HISTORY_SIZE = 50;

/**
 * Custom hook for undo/redo functionality
 */
export function useUndoRedo(): UseUndoRedoReturn {
    const [historyIndex, setHistoryIndex] = useState(-1);
    const historyRef = useRef<HistoryState[]>([]);
    const isUndoRedoAction = useRef(false);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < historyRef.current.length - 1;

    /**
     * Push a new state to history
     */
    const pushHistory = useCallback((nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
        // Don't push if this is an undo/redo action
        if (isUndoRedoAction.current) {
            isUndoRedoAction.current = false;
            return;
        }

        // Create a deep copy of the state
        const state: HistoryState = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
        };

        // Remove any future states if we're not at the end
        if (historyIndex < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, historyIndex + 1);
        }

        // Add new state
        historyRef.current.push(state);

        // Limit history size
        if (historyRef.current.length > MAX_HISTORY_SIZE) {
            historyRef.current.shift();
        } else {
            setHistoryIndex(prev => prev + 1);
        }
    }, [historyIndex]);

    /**
     * Undo last action
     */
    const undo = useCallback((): HistoryState | null => {
        if (!canUndo) return null;

        isUndoRedoAction.current = true;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);

        return historyRef.current[newIndex];
    }, [canUndo, historyIndex]);

    /**
     * Redo last undone action
     */
    const redo = useCallback((): HistoryState | null => {
        if (!canRedo) return null;

        isUndoRedoAction.current = true;
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);

        return historyRef.current[newIndex];
    }, [canRedo, historyIndex]);

    /**
     * Clear all history
     */
    const clearHistory = useCallback(() => {
        historyRef.current = [];
        setHistoryIndex(-1);
    }, []);

    return {
        historyIndex,
        historyLength: historyRef.current.length,
        canUndo,
        canRedo,
        pushHistory,
        undo,
        redo,
        clearHistory,
    };
}

export default useUndoRedo;
