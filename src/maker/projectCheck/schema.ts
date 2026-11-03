export type Evidence = { path: string; line: number; symbol: string };
export type Analysis = {
  schema: 1;
  factsRevision: string;
  resultRevision: string;
  summary: string;
  insight: string;
  modules: Array<{ id: string; title: string; description: string; files: string[] }>;
  guide: Array<{ title: string; text: string; evidence: Evidence }>;
  flow: null | {
    title: string;
    note: string;
    extra: string;
    nodes: Array<{ id: string; label: string; evidence: Evidence }>;
    edges: Array<{ from: string; to: string; label: string }>;
  };
  findings: Array<{
    category: 'unreferenced' | 'duplicate' | 'oversized' | 'organization';
    severity: 'info' | 'medium' | 'high';
    title: string;
    detail: string;
    evidence: Evidence[];
  }>;
  limitations: string[];
};

export const projectCheckCapabilities = {
  version: 1,
  commands: {
    collect:
      'project-check collect --target-dir ABSOLUTE_PROJECT --json: read local facts and save a bounded snapshot in Maker home; returns facts and revisions.',
    publish:
      'project-check publish --target-dir ABSOLUTE_PROJECT --input-file ANALYSIS.json --json: validate AI analysis against collected facts, then atomically publish for the console.',
    show: 'project-check show --target-dir ABSOLUTE_PROJECT --json: read the last published result; never scans.',
    capabilities: 'project-check capabilities --json: show this contract. No project required.',
  },
  analysis: {
    schema: 1,
    factsRevision: 'Copy from collect',
    resultRevision: 'Copy from collect (none for first publication)',
    summary: 'Project purpose and structure, based on code',
    insight: 'How to read the architecture and its uncertainty',
    modules: [
      {
        id: 'startup',
        title: 'Startup',
        description: 'Explain responsibility from code',
        files: ['scripts/main.lua'],
      },
    ],
    guide: [
      {
        title: 'Entry',
        text: 'Explain the actual code',
        evidence: { path: 'scripts/main.lua', line: 1, symbol: 'Start' },
      },
    ],
    flow: null,
    findings: [
      {
        category: 'organization',
        severity: 'info',
        title: 'Finding',
        detail: 'Explain evidence, uncertainty and recommendation',
        evidence: [{ path: 'assets/image', line: 1, symbol: 'Directory' }],
      },
    ],
    limitations: ['List incomplete checks and unresolved dynamic references'],
  },
  flow: {
    title: 'Reviewed business flow',
    note: 'Scope reviewed',
    extra: 'Unverified branches',
    nodes: [
      {
        id: 'start',
        label: 'Start',
        evidence: { path: 'scripts/main.lua', line: 1, symbol: 'Start' },
      },
    ],
    edges: [{ from: 'start', to: 'start', label: 'Loop condition' }],
  },
  rules: [
    'All analysis fields are required. flow may be null. Every collected Lua file must belong to exactly one module; empty modules are allowed only when no Lua files were collected.',
    'IDs use letters, digits, underscore or hyphen (1-64 chars). At most 48 modules, 100 guide items/flow nodes, 500 findings/flow edges; strings up to 4000 chars.',
    'Evidence uses project-relative paths, positive line numbers and a short symbol/description. Lua evidence must match collected files and line ranges. Other evidence must exist inside the same project; directory or binary evidence uses line 1.',
    'Read code to explain roles, dynamic loading and business flow. No automatic model calls. Scanner candidates are not deletion decisions.',
    'Both revisions must match. Invalid or conflicting publication preserves the previous result. Collect does not replace published results.',
    'Results are dated snapshots, not live verification. Reading the console or show does not scan project files.',
    'No asset mutation, compression, upload, build or deletion is performed. image compress is a separate existing PNG lossless command.',
  ],
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an analysis object.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000)
    throw new Error('Expected nonempty text (up to 4000 characters).');
  return value;
}
function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error('Invalid or oversized analysis list.');
  return value.map(parse);
}
function id(value: unknown): string {
  const result = text(value);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(result)) throw new Error('Invalid analysis ID.');
  return result;
}
function evidence(value: unknown): Evidence {
  const item = object(value);
  if (!Number.isSafeInteger(item.line) || Number(item.line) < 1)
    throw new Error('Evidence needs a positive line number.');
  return { path: text(item.path), line: Number(item.line), symbol: text(item.symbol) };
}
function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate module or flow node ID.');
}

/** Normalize untrusted AI output before persisting or passing it to the viewer. */
export function parseAnalysis(value: unknown): Analysis {
  const a = object(value);
  if (
    a.schema !== 1 ||
    !/^[a-f0-9]{64}$/.test(String(a.factsRevision)) ||
    !/^(none|[a-f0-9]{64})$/.test(String(a.resultRevision))
  )
    throw new Error('Invalid schema or revision.');
  const modules = list(a.modules, 48, (value) => {
    const m = object(value);
    return {
      id: id(m.id),
      title: text(m.title),
      description: text(m.description),
      files: list(m.files, 20000, text),
    };
  });
  unique(modules.map((m) => m.id));
  const guide = list(a.guide, 100, (value) => {
    const g = object(value);
    return { title: text(g.title), text: text(g.text), evidence: evidence(g.evidence) };
  });
  let flow: Analysis['flow'] = null;
  if (a.flow !== null) {
    const f = object(a.flow);
    const nodes = list(f.nodes, 100, (value) => {
      const n = object(value);
      return { id: id(n.id), label: text(n.label), evidence: evidence(n.evidence) };
    });
    if (!nodes.length) throw new Error('A flow needs at least one node.');
    unique(nodes.map((n) => n.id));
    const edges = list(f.edges, 500, (value) => {
      const e = object(value);
      const edge = { from: id(e.from), to: id(e.to), label: text(e.label) };
      if (![edge.from, edge.to].every((id) => nodes.some((n) => n.id === id)))
        throw new Error('Unknown flow endpoint.');
      return edge;
    });
    flow = { title: text(f.title), note: text(f.note), extra: text(f.extra), nodes, edges };
  }
  const findings = list(a.findings, 500, (value) => {
    const f = object(value);
    if (
      !['unreferenced', 'duplicate', 'oversized', 'organization'].includes(String(f.category)) ||
      !['info', 'medium', 'high'].includes(String(f.severity))
    )
      throw new Error('Invalid finding category or severity.');
    const refs = list(f.evidence, 50, evidence);
    if (!refs.length) throw new Error('Each finding needs evidence.');
    return {
      category: f.category as Analysis['findings'][number]['category'],
      severity: f.severity as Analysis['findings'][number]['severity'],
      title: text(f.title),
      detail: text(f.detail),
      evidence: refs,
    };
  });
  return {
    schema: 1,
    factsRevision: String(a.factsRevision),
    resultRevision: String(a.resultRevision),
    summary: text(a.summary),
    insight: text(a.insight),
    modules,
    guide,
    flow,
    findings,
    limitations: list(a.limitations, 100, text),
  };
}
