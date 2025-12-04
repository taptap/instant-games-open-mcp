/**
 * Cloud Save Resources
 * Unified definitions and handlers for CloudSaveManager and FileSystemManager APIs
 */

import type { ResourceRegistration } from '../../core/types/index.js';
import { cloudSaveTools } from './docTools.js';

/**
 * Cloud Save Resources
 * Each resource combines its definition and handler in one place
 */
export const cloudSaveResources: ResourceRegistration[] = [
  // ============ CloudSaveManager APIs ============

  // Get CloudSaveManager instance
  {
    uri: 'docs://cloud-save/api/get-cloud-save-manager',
    name: 'API: tap.getCloudSaveManager()',
    description:
      'How to get CloudSaveManager instance - READ THIS when user asks how to initialize or access cloud save system',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getCloudSaveManager(),
  },

  // Create Archive
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/create-archive',
    name: 'API: createArchive()',
    description:
      'How to create a new cloud archive - READ THIS when user asks how to save/upload game data to cloud',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.createArchive(),
  },

  // Update Archive
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/update-archive',
    name: 'API: updateArchive()',
    description:
      'How to update an existing cloud archive - READ THIS when user asks how to modify/update existing save data',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.updateArchive(),
  },

  // Get Archive List
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-list',
    name: 'API: getArchiveList()',
    description:
      'How to get all cloud archives - READ THIS when user asks how to list/query all save slots',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getArchiveList(),
  },

  // Get Archive Data
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-data',
    name: 'API: getArchiveData()',
    description:
      'How to download archive file from cloud - READ THIS when user asks how to load/download save data',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getArchiveData(),
  },

  // Get Archive Cover
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-cover',
    name: 'API: getArchiveCover()',
    description:
      'How to download archive cover image - READ THIS when user asks how to get save thumbnail/screenshot',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getArchiveCover(),
  },

  // Delete Archive
  {
    uri: 'docs://cloud-save/api/cloud-save-manager/delete-archive',
    name: 'API: deleteArchive()',
    description:
      'How to delete a cloud archive - READ THIS when user asks how to remove/delete save data',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.deleteArchive(),
  },

  // ============ FileSystemManager APIs ============

  // Get FileSystemManager instance
  {
    uri: 'docs://cloud-save/api/get-file-system-manager',
    name: 'API: tap.getFileSystemManager()',
    description:
      'How to get FileSystemManager instance - READ THIS when user asks how to access local file system',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getFileSystemManager(),
  },

  // Write File
  {
    uri: 'docs://cloud-save/api/file-system-manager/write-file',
    name: 'API: writeFile()',
    description:
      'How to write data to local file - READ THIS when user asks how to save data locally before uploading',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.writeFile(),
  },

  // Read File
  {
    uri: 'docs://cloud-save/api/file-system-manager/read-file',
    name: 'API: readFile()',
    description:
      'How to read data from local file - READ THIS when user asks how to load downloaded save data',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.readFile(),
  },

  // Make Directory
  {
    uri: 'docs://cloud-save/api/file-system-manager/mkdir',
    name: 'API: mkdir()',
    description:
      'How to create a directory - READ THIS when user asks how to create folders for organizing saves',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.mkdir(),
  },

  // Remove Directory
  {
    uri: 'docs://cloud-save/api/file-system-manager/rmdir',
    name: 'API: rmdir()',
    description: 'How to remove a directory - READ THIS when user asks how to delete folders',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.rmdir(),
  },

  // Unlink (Delete File)
  {
    uri: 'docs://cloud-save/api/file-system-manager/unlink',
    name: 'API: unlink()',
    description: 'How to delete a file - READ THIS when user asks how to remove local files',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.unlink(),
  },

  // ============ Overview ============

  // Complete Overview
  {
    uri: 'docs://cloud-save/overview',
    name: 'Cloud Save Complete Overview',
    description:
      'Complete overview of all Cloud Save and FileSystem APIs - READ THIS when you want to understand what APIs are available',
    mimeType: 'text/markdown',
    handler: async () => cloudSaveTools.getOverview(),
  },
];

// Legacy exports for backward compatibility
export const cloudSaveResourceDefinitions = cloudSaveResources.map(
  ({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  })
);

export const cloudSaveResourceHandlers = cloudSaveResources.map((r) => r.handler);
