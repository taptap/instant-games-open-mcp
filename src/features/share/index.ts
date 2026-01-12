/**
 * Share Feature Module
 */

import { shareToolDefinitions, shareToolHandlers } from './tools.js';
import { shareResourceDefinitions, shareResourceHandlers } from './resources.js';

export const shareModule = {
  name: 'share',
  description: 'TapTap Share 功能',

  tools: shareToolDefinitions.map((definition, index) => ({
    definition,
    handler: shareToolHandlers[index],
    requiresAuth: [
      // 服务端管理工具需要认证
      'create_share_template',
      'list_share_templates',
      'get_share_template_info',
    ].includes(definition.name),
  })),

  resources: shareResourceDefinitions.map((definition, index) => ({
    ...definition,
    handler: shareResourceHandlers[index],
  })),
};
