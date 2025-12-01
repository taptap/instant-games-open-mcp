/**
 * Documentation Helper Utilities
 * Shared utilities for generating documentation across all features
 */

/**
 * Generic API interface for documentation
 */
export interface APIDefinition {
  name: string;
  method: string;
  description: string;
  parameters?: Record<string, string>;
  returnValue?: string;
  example: string;
}

/**
 * Generic category interface
 */
export interface APICategory {
  title: string;
  description: string;
  apis: APIDefinition[];
}

/**
 * Generic documentation structure
 */
export interface Documentation {
  title: string;
  description: string;
  apiReference?: string;
  categories: Record<string, APICategory>;
}

/**
 * Generate API documentation in Markdown format
 *
 * @param documentation - The documentation structure
 * @param categoryKey - The category key to look up
 * @param apiName - The API name to find
 * @returns Formatted Markdown documentation
 *
 * @example
 * ```typescript
 * const doc = generateAPIDoc(
 *   LEADERBOARD_DOCUMENTATION,
 *   'initialization',
 *   'tap.getLeaderboardManager'
 * );
 * ```
 */
export function generateAPIDoc(
  documentation: Documentation,
  categoryKey: string,
  apiName: string
): string {
  const category = documentation.categories[categoryKey];
  if (!category) {
    return `Category "${categoryKey}" not found`;
  }

  const api = category.apis.find((a) => a.name === apiName);
  if (!api) {
    return `API "${apiName}" not found in category "${categoryKey}"`;
  }

  let doc = `# ${api.name}\n\n`;
  doc += `**Method Signature:**\n\`\`\`javascript\n${api.method}\n\`\`\`\n\n`;
  doc += `**Description:** ${api.description}\n\n`;

  if (api.parameters) {
    doc += `## Parameters\n\n`;
    for (const [param, desc] of Object.entries(api.parameters)) {
      doc += `- **\`${param}\`**: ${desc}\n`;
    }
    doc += '\n';
  }

  if (api.returnValue) {
    doc += `## Returns\n\n${api.returnValue}\n\n`;
  }

  doc += `## Code Example\n\n\`\`\`javascript\n${api.example}\n\`\`\`\n`;

  return doc;
}

/**
 * Generate category documentation (all APIs in a category)
 *
 * @param documentation - The documentation structure
 * @param categoryKey - The category key to generate
 * @returns Formatted Markdown documentation
 */
export function generateCategoryDoc(documentation: Documentation, categoryKey: string): string {
  const category = documentation.categories[categoryKey];
  if (!category) {
    return `Category "${categoryKey}" not found`;
  }

  let doc = `# ${category.title}\n\n${category.description}\n\n`;

  for (const api of category.apis) {
    doc += `## ${api.name}\n\n`;
    doc += `${api.description}\n\n`;
    doc += `\`\`\`javascript\n${api.example}\n\`\`\`\n\n`;
  }

  return doc;
}

/**
 * Search documentation by keyword
 *
 * @param documentation - The documentation structure
 * @param query - Search query
 * @returns Array of matching API documentation strings
 */
export function searchDocumentation(documentation: Documentation, query: string): string[] {
  const results: string[] = [];
  const queryLower = query.toLowerCase();

  for (const [categoryKey, category] of Object.entries(documentation.categories)) {
    for (const api of category.apis) {
      // Search in name, method, and description
      if (
        api.name.toLowerCase().includes(queryLower) ||
        api.method.toLowerCase().includes(queryLower) ||
        api.description.toLowerCase().includes(queryLower)
      ) {
        results.push(generateAPIDoc(documentation, categoryKey, api.name));
      }
    }
  }

  return results;
}

/**
 * Generate complete overview documentation
 *
 * @param documentation - The documentation structure
 * @returns Formatted Markdown overview
 */
export function generateOverview(documentation: Documentation): string {
  let doc = `# ${documentation.title}\n\n`;
  doc += `${documentation.description}\n\n`;

  if (documentation.apiReference) {
    doc += `**Official Documentation**: ${documentation.apiReference}\n\n`;
  }

  doc += `## 📚 API Categories\n\n`;

  for (const [key, category] of Object.entries(documentation.categories)) {
    doc += `### ${category.title}\n\n`;
    doc += `${category.description}\n\n`;
    doc += `**APIs:**\n`;

    for (const api of category.apis) {
      doc += `- \`${api.name}\` - ${api.description.split('\n')[0]}\n`;
    }

    doc += `\n`;
  }

  return doc;
}

/**
 * Resource suggestion based on keywords
 * Used when search returns no results
 */
export interface ResourceSuggestion {
  keywords: string[];
  uri: string;
  description: string;
}

/**
 * Generate search suggestions when no results found
 *
 * @param query - Search query
 * @param suggestions - Array of resource suggestions
 * @param overviewUri - URI of the overview resource
 * @returns Formatted suggestion message
 */
export function generateSearchSuggestions(
  query: string,
  suggestions: ResourceSuggestion[],
  overviewUri?: string
): string {
  let message = `No results found for "${query}".\n\n`;
  message += `💡 **建议：直接读取相关 Resources 获取完整文档**\n\n`;

  const queryLower = query.toLowerCase();
  let foundSuggestions = false;

  for (const suggestion of suggestions) {
    if (suggestion.keywords.some((keyword) => queryLower.includes(keyword))) {
      message += `- ${suggestion.uri} - ${suggestion.description}\n`;
      foundSuggestions = true;
    }
  }

  if (!foundSuggestions && overviewUri) {
    message += `\n或查看完整概览：\n`;
    message += `- ${overviewUri} - 完整功能概览\n`;
  }

  return message;
}
