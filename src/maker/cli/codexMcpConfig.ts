/**
 * TOML-aware helpers for locating and editing Codex MCP tables.
 */

export type CodexMcpTable = {
  headerStart: number;
  bodyStart: number;
  bodyEnd: number;
  normalizedPath: string;
  isMain: boolean;
};

export type TomlBooleanAssignment = {
  value: boolean;
  valueStart: number;
  valueEnd: number;
};

type TomlTable = {
  headerStart: number;
  bodyStart: number;
  bodyEnd: number;
  path: string;
};

type MultilineString = 'basic' | 'literal' | undefined;

export function findCodexMcpTables(content: string, mcpName: string): CodexMcpTable[] {
  const mainPath = `mcp_servers.${mcpName}`;
  return findTomlTables(content).flatMap((table) => {
    const normalizedPath = normalizeCodexMcpTablePath(table.path, mcpName);
    if (!normalizedPath) {
      return [];
    }
    return [
      {
        headerStart: table.headerStart,
        bodyStart: table.bodyStart,
        bodyEnd: table.bodyEnd,
        normalizedPath,
        isMain: normalizedPath === mainPath,
      },
    ];
  });
}

export function removeCodexMcpTables(content: string, mcpName: string): string {
  const tables = findCodexMcpTables(content, mcpName);
  return [...tables]
    .reverse()
    .reduce(
      (updated, table) => `${updated.slice(0, table.headerStart)}${updated.slice(table.bodyEnd)}`,
      content
    );
}

export function findCodexMcpTableDuplicates(text: string, mcpName: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const table of findCodexMcpTables(text, mcpName)) {
    if (seen.has(table.normalizedPath)) {
      duplicates.add(table.normalizedPath);
    } else {
      seen.add(table.normalizedPath);
    }
  }
  return Array.from(duplicates);
}

export function findTomlBooleanAssignment(
  content: string,
  start: number,
  end: number,
  key: string
): TomlBooleanAssignment | undefined {
  const keyPattern = escapeRegExp(key);
  let multiline: MultilineString;
  for (const line of splitTomlLines(content, start, end)) {
    if (!multiline) {
      const match = new RegExp(`^\\s*${keyPattern}\\s*=\\s*(true|false)\\s*(?:#.*)?$`).exec(
        line.text
      );
      if (match?.index !== undefined) {
        const relativeValueStart = match.index + match[0].indexOf(match[1]);
        return {
          value: match[1] === 'true',
          valueStart: line.start + relativeValueStart,
          valueEnd: line.start + relativeValueStart + match[1].length,
        };
      }
    }
    multiline = scanTomlLine(line.text, multiline);
  }
  return undefined;
}

export function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findTomlTables(content: string): TomlTable[] {
  const tables: TomlTable[] = [];
  let multiline: MultilineString;
  for (const line of splitTomlLines(content)) {
    if (!multiline) {
      const match = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line.text);
      if (match) {
        const previous = tables[tables.length - 1];
        if (previous) {
          previous.bodyEnd = line.start;
        }
        tables.push({
          headerStart: line.start,
          bodyStart: line.end,
          bodyEnd: content.length,
          path: match[1],
        });
      }
    }
    multiline = scanTomlLine(line.text, multiline);
  }
  return tables;
}

function splitTomlLines(
  content: string,
  start = 0,
  end = content.length
): Array<{ start: number; end: number; text: string }> {
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let lineStart = start;
  while (lineStart < end) {
    const newline = content.indexOf('\n', lineStart);
    const nextLineStart = newline === -1 || newline >= end ? end : newline + 1;
    let lineEnd = newline === -1 || newline >= end ? end : newline;
    if (lineEnd > lineStart && content[lineEnd - 1] === '\r') {
      lineEnd -= 1;
    }
    lines.push({
      start: lineStart,
      end: lineEnd,
      text: content.slice(lineStart, lineEnd),
    });
    lineStart = nextLineStart;
  }
  return lines;
}

function scanTomlLine(line: string, initial: MultilineString): MultilineString {
  let multiline = initial;
  let index = 0;

  while (index < line.length) {
    if (multiline === 'basic') {
      const closing = findUnescapedTripleQuote(line, index, '"""');
      if (closing === -1) {
        return multiline;
      }
      multiline = undefined;
      index = closing + 3;
      continue;
    }
    if (multiline === 'literal') {
      const closing = line.indexOf("'''", index);
      if (closing === -1) {
        return multiline;
      }
      multiline = undefined;
      index = closing + 3;
      continue;
    }

    const character = line[index];
    if (character === '#') {
      return undefined;
    }
    if (line.startsWith('"""', index)) {
      multiline = 'basic';
      index += 3;
      continue;
    }
    if (line.startsWith("'''", index)) {
      multiline = 'literal';
      index += 3;
      continue;
    }
    if (character === '"') {
      index = skipBasicString(line, index + 1);
      continue;
    }
    if (character === "'") {
      const closing = line.indexOf("'", index + 1);
      index = closing === -1 ? line.length : closing + 1;
      continue;
    }
    index += 1;
  }

  return multiline;
}

function findUnescapedTripleQuote(line: string, start: number, delimiter: string): number {
  let match = line.indexOf(delimiter, start);
  while (match !== -1) {
    let backslashes = 0;
    for (let index = match - 1; index >= 0 && line[index] === '\\'; index -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) {
      return match;
    }
    match = line.indexOf(delimiter, match + delimiter.length);
  }
  return -1;
}

function skipBasicString(line: string, start: number): number {
  let escaped = false;
  for (let index = start; index < line.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (line[index] === '\\') {
      escaped = true;
      continue;
    }
    if (line[index] === '"') {
      return index + 1;
    }
  }
  return line.length;
}

function normalizeCodexMcpTablePath(tablePath: string, mcpName: string): string | undefined {
  const keyPattern = createCodexMcpKeyPattern(mcpName);
  const match = new RegExp(`^mcp_servers\\.${keyPattern}(\\..+)?$`).exec(tablePath);
  if (!match) {
    return undefined;
  }
  return `mcp_servers.${mcpName}${match[1] || ''}`;
}

function createCodexMcpKeyPattern(mcpName: string): string {
  const quotedKey = `"${escapeRegExp(mcpName)}"`;
  if (!/^[A-Za-z0-9_-]+$/.test(mcpName)) {
    return quotedKey;
  }
  return `(?:${quotedKey}|${escapeRegExp(mcpName)})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
