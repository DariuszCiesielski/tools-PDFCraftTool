/**
 * Property-Based Tests for Project Storage (IndexedDB)
 * 
 * Tests the round-trip property for project save/load operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import 'fake-indexeddb/auto';
import {
  type ProjectState,
  saveProject,
  getProject,
  deleteProject,
  clearAllProjects,
} from '@/lib/storage/project-db';

// Helper to generate valid project file metadata
const fileMetadataArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  size: fc.integer({ min: 1, max: 100_000_000 }),
  type: fc.constantFrom('application/pdf', 'image/png', 'image/jpeg', 'text/plain'),
  lastModified: fc.integer({ min: 0, max: Date.now() }),
});

// Helper to generate valid tool IDs (based on actual tools in the system)
const toolIdArb = fc.constantFrom(
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'rotate-pdf',
  'extract-pages',
  'delete-pages',
  'organize-pdf',
  'add-watermark',
  'encrypt-pdf',
  'decrypt-pdf'
);

// Helper to generate valid project status
const statusArb = fc.constantFrom('in_progress', 'paused', 'completed') as fc.Arbitrary<'in_progress' | 'paused' | 'completed'>;

// Helper to generate valid project options
const optionsArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string({ maxLength: 100 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 0, maxKeys: 10 }
);

// Helper to generate valid project name
const projectNameArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

// Helper to generate valid tool name
const toolNameArb = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  { nil: undefined }
);

// Helper to generate valid progress value
const progressArb = fc.integer({ min: 0, max: 100 });

describe('Project Storage Property Tests', () => {
  // Clear database before each test
  beforeEach(async () => {
    await clearAllProjects();
  });

  // Clear database after each test
  afterEach(async () => {
    await clearAllProjects();
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 13: Project Save Round-Trip**
   * **Validates: Requirements 10.2**
   * 
   * For any valid project state saved to IndexedDB, retrieving that project
   * SHALL return data equivalent to the original saved state.
   */
  it('Property 13: project save and retrieve returns equivalent data', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        toolIdArb,
        toolNameArb,
        statusArb,
        optionsArb,
        fc.array(fileMetadataArb, { minLength: 0, maxLength: 5 }),
        progressArb,
        async (name, toolId, toolName, status, options, fileMetadata, progress) => {
          // Save the project
          const savedProject = await saveProject({
            name,
            toolId,
            toolName,
            status,
            options,
            fileMetadata,
            progress,
          });

          // Verify the saved project has an ID
          expect(savedProject.id).toBeDefined();
          expect(savedProject.id.length).toBeGreaterThan(0);

          // Retrieve the project
          const retrievedProject = await getProject(savedProject.id);

          // Verify the retrieved project is not null
          expect(retrievedProject).not.toBeNull();

          if (retrievedProject) {
            // Verify all fields match (round-trip property)
            expect(retrievedProject.id).toBe(savedProject.id);
            expect(retrievedProject.name).toBe(name);
            expect(retrievedProject.toolId).toBe(toolId);
            expect(retrievedProject.toolName).toBe(toolName);
            expect(retrievedProject.status).toBe(status);
            expect(retrievedProject.progress).toBe(progress);
            
            // Deep equality for options
            expect(retrievedProject.options).toEqual(options);
            
            // Deep equality for file metadata
            expect(retrievedProject.fileMetadata).toEqual(fileMetadata);
            
            // Timestamps should be valid ISO strings
            expect(new Date(retrievedProject.createdAt).toISOString()).toBe(retrievedProject.createdAt);
            expect(new Date(retrievedProject.updatedAt).toISOString()).toBe(retrievedProject.updatedAt);
          }

          // Clean up
          await deleteProject(savedProject.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 13: Multiple Projects Round-Trip**
   * **Validates: Requirements 10.2**
   * 
   * For any set of valid projects saved to IndexedDB, each project
   * SHALL be retrievable independently with equivalent data.
   */
  it('Property 13: multiple projects can be saved and retrieved independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: projectNameArb,
            toolId: toolIdArb,
            toolName: toolNameArb,
            status: statusArb,
            options: optionsArb,
            fileMetadata: fc.array(fileMetadataArb, { minLength: 0, maxLength: 3 }),
            progress: progressArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (projectInputs) => {
          const savedProjects: ProjectState[] = [];

          // Save all projects
          for (const input of projectInputs) {
            const saved = await saveProject(input);
            savedProjects.push(saved);
          }

          // Verify each project can be retrieved independently
          for (let i = 0; i < savedProjects.length; i++) {
            const saved = savedProjects[i];
            const input = projectInputs[i];
            const retrieved = await getProject(saved.id);

            expect(retrieved).not.toBeNull();
            if (retrieved) {
              expect(retrieved.name).toBe(input.name);
              expect(retrieved.toolId).toBe(input.toolId);
              expect(retrieved.toolName).toBe(input.toolName);
              expect(retrieved.status).toBe(input.status);
              expect(retrieved.progress).toBe(input.progress);
              expect(retrieved.options).toEqual(input.options);
              expect(retrieved.fileMetadata).toEqual(input.fileMetadata);
            }
          }

          // Clean up
          for (const project of savedProjects) {
            await deleteProject(project.id);
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 13: Project IDs are Unique**
   * **Validates: Requirements 10.2**
   * 
   * For any set of projects saved, each project SHALL have a unique ID.
   */
  it('Property 13: saved projects have unique IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: projectNameArb,
            toolId: toolIdArb,
            status: statusArb,
            options: fc.constant({}),
            fileMetadata: fc.constant([]),
            progress: fc.constant(0),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (projectInputs) => {
          const savedProjects: ProjectState[] = [];

          // Save all projects
          for (const input of projectInputs) {
            const saved = await saveProject(input);
            savedProjects.push(saved);
          }

          // Verify all IDs are unique
          const ids = savedProjects.map(p => p.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);

          // Clean up
          for (const project of savedProjects) {
            await deleteProject(project.id);
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 13: Deleted Projects Cannot Be Retrieved**
   * **Validates: Requirements 10.2**
   * 
   * For any project that has been deleted, attempting to retrieve it
   * SHALL return null.
   */
  it('Property 13: deleted projects return null on retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        toolIdArb,
        async (name, toolId) => {
          // Save a project
          const saved = await saveProject({
            name,
            toolId,
            status: 'in_progress',
            options: {},
            fileMetadata: [],
            progress: 0,
          });

          // Verify it exists
          const beforeDelete = await getProject(saved.id);
          expect(beforeDelete).not.toBeNull();

          // Delete the project
          await deleteProject(saved.id);

          // Verify it no longer exists
          const afterDelete = await getProject(saved.id);
          expect(afterDelete).toBeNull();

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
