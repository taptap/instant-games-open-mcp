/**
 * Share Resources Definitions and Handlers
 */

import { shareTools } from './docTools.js';

/**
 * Resource 定义数组
 */
export const shareResourceDefinitions = [
  {
    uri: 'docs://share/overview',
    name: 'Share Complete Overview',
    description: 'Complete overview of all Share APIs',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/show-shareboard',
    name: 'tap.showShareboard() API Documentation',
    description: 'Complete documentation for tap.showShareboard() API - Display share panel',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/set-shareboard-hidden',
    name: 'tap.setShareboardHidden() API Documentation',
    description:
      'Complete documentation for tap.setShareboardHidden() API - Hide/show share panel in menu',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/on-share-message',
    name: 'tap.onShareMessage() API Documentation',
    description: 'Complete documentation for tap.onShareMessage() API - Listen to share events',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/off-share-message',
    name: 'tap.offShareMessage() API Documentation',
    description: 'Complete documentation for tap.offShareMessage() API - Cancel share listener',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/on-show',
    name: 'tap.onShow() API Documentation',
    description:
      'Complete documentation for tap.onShow() API - Receive sceneParam when entering minigame through shared card (hot start)',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/get-launch-options-sync',
    name: 'tap.getLaunchOptionsSync() API Documentation',
    description:
      'Complete documentation for tap.getLaunchOptionsSync() API - Receive sceneParam when entering minigame through shared card (cold start)',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://share/api/get-enter-options-sync',
    name: 'tap.getEnterOptionsSync() API Documentation',
    description:
      'Complete documentation for tap.getEnterOptionsSync() API - Receive sceneParam when entering minigame through shared card (both cold and hot start)',
    mimeType: 'text/markdown',
  },
];

/**
 * Resource 处理器数组（顺序必须与定义数组一致）
 */
export const shareResourceHandlers = [
  // docs://share/overview
  async () => shareTools.getOverview(),

  // docs://share/api/show-shareboard
  async () => shareTools.showShareboard(),

  // docs://share/api/set-shareboard-hidden
  async () => shareTools.setShareboardHidden(),

  // docs://share/api/on-share-message
  async () => shareTools.onShareMessage(),

  // docs://share/api/off-share-message
  async () => shareTools.offShareMessage(),

  // docs://share/api/on-show
  async () => shareTools.onShow(),

  // docs://share/api/get-launch-options-sync
  async () => shareTools.getLaunchOptionsSync(),

  // docs://share/api/get-enter-options-sync
  async () => shareTools.getEnterOptionsSync(),
];
