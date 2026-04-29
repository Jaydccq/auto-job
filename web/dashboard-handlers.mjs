/**
 * Dashboard handlers — pure helpers used by the bridge dashboard route.
 *
 * Originally this file ran a standalone HTTP server on port 47329. As of
 * Stage 3, the dashboard is served by the bridge at /dashboard/* and this
 * module exports only the building blocks (PDF generation, apply-status
 * mutation, full-evaluation queue helpers, profile/CV parsing, etc.) that
 * apps/server/src/routes/dashboard.ts wires into Fastify.
 *
 * Real PDF generation requires Node + Playwright, hence the helpers stay
 * out of the browser bundle.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BRIDGE_BASE = (process.env.AUTO_JOB_BRIDGE_BASE || 'http://127.0.0.1:47319').replace(/\/+$/, '');
const BRIDGE_TOKEN_PATH = join(ROOT, 'apps', 'server', '.bridge-token');
const OUTPUT_DIR = join(ROOT, 'output');
const WORK_DIR = join(OUTPUT_DIR, '.apply-docs');
export const DOWNLOADS_DIR = join(os.homedir(), 'Desktop');
export const APPLICATIONS_PATH = join(ROOT, 'data', 'applications.md');
export const docStore = new Map();
const TERMINAL_APPLICATION_STATUSES = new Set(['Applied', 'Responded', 'Interview', 'Offer']);

class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'for', 'from', 'has',
  'have', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'our', 'that', 'the',
  'their', 'this', 'to', 'using', 'with', 'work', 'role', 'team', 'build',
  'built', 'systems', 'software', 'engineer', 'engineering', 'candidate',
  'strong', 'experience', 'project', 'projects', 'cv', 'jd',
]);

const TECH_TERMS = [
  'AI agents',
  'Agentic workflows',
  'LLM orchestration',
  'Tool orchestration',
  'Workflow orchestration',
  'RAG',
  'Retrieval-Augmented Generation',
  'Vercel AI SDK',
  'Function Calling',
  'pgvector',
  'Vector DB',
  'OpenAI Embeddings',
  'LangChain',
  'Python',
  'PySpark',
  'PyTorch',
  'TypeScript',
  'JavaScript',
  'Java',
  'C++',
  'C++17',
  'C',
  'React',
  'Next.js',
  'Node.js',
  'NestJS',
  'Spring Boot',
  'Spring Security',
  'REST',
  'SQL',
  'PostgreSQL',
  'Postgres',
  'Redis',
  'RabbitMQ',
  'BullMQ',
  'WebSocket',
  'SSE',
  'Docker',
  'AWS',
  'AWS EC2',
  'GitHub Actions',
  'CI/CD',
  'Prometheus',
  'Grafana',
  'Airflow',
  'Linux',
  'epoll',
  'OAuth2',
  'JWT',
  'RBAC',
  'JUnit 5',
  'Valgrind',
  'TailwindCSS',
  'Distributed Systems',
  'Microservices',
  'High-concurrency',
  'Event-driven architecture',
  'Real-time tracking',
  'Observability',
  'Security',
  'Product ownership',
  'AI-native development',
  'harness-engineering',
];

const ROLE_THEME_DEFINITIONS = [
  {
    key: 'frontend',
    label: 'polished front-end experiences',
    patterns: [/polished front-end/i, /polished frontend/i, /front-end/i, /frontend/i, /\bReact\b/i, /\bTypeScript\b/i, /user experiences?/i, /\bUI\b/i, /webassembly/i],
  },
  {
    key: 'product',
    label: '0-to-1 product ownership',
    patterns: [/product mindset/i, /product development/i, /product direction/i, /ideation/i, /launch/i, /iteration/i, /feature/i, /user needs/i, /prototype/i],
  },
  {
    key: 'realtime',
    label: 'real-time collaboration',
    patterns: [/real[- ]time collaborat/i, /collaborate in real time/i, /collaboration/i, /shared state/i, /collaborative systems/i],
  },
  {
    key: 'extensibility',
    label: 'developer tooling and extensibility',
    patterns: [/developer workflows/i, /developer tooling/i, /extensibility/i, /plugins/i, /widgets/i, /\bAPIs?\b/i],
  },
  {
    key: 'crossFunctional',
    label: 'cross-functional product collaboration',
    patterns: [/cross-functional/i, /\bProduct\b/i, /\bDesign\b/i, /\bResearch\b/i, /\bData\b/i],
  },
  {
    key: 'observability',
    label: 'reliability and observability',
    patterns: [/reliability/i, /\bmonitor\b/i, /observability/i, /scalability/i, /security/i],
  },
  {
    key: 'data',
    label: 'large-scale data pipelines',
    patterns: [/data extraction/i, /\bETL\b/i, /ingestion/i, /dataset/i, /pipeline/i, /batch/i, /workflow/i, /PySpark/i, /Airflow/i],
  },
  {
    key: 'training',
    label: 'model training and evaluation',
    patterns: [/model training/i, /evaluation/i, /\bPyTorch\b/i, /\bTensorFlow\b/i, /reinforcement learning/i, /imitation learning/i, /computer vision/i, /\bCNN\b/i],
  },
  {
    key: 'inference',
    label: 'low-latency inference',
    patterns: [/inference/i, /soft real-time/i, /real-time/i, /latency/i, /onboard/i, /streaming/i],
  },
  {
    key: 'systems',
    label: 'Linux performance and concurrency',
    patterns: [/\bC\+\+\b/i, /\bC\+\+17\b/i, /\bLinux\b/i, /operating systems/i, /concurrency/i, /memory management/i, /process scheduling/i, /profiling/i, /\bepoll\b/i, /\bValgrind\b/i],
  },
  {
    key: 'cloud',
    label: 'batch workflow orchestration',
    patterns: [/\bAWS\b/i, /cloud/i, /workflow management/i, /Docker/i, /BullMQ/i, /RabbitMQ/i, /GitHub Actions/i],
  },
];

const FORBIDDEN_APPLICATION_TEXT_PATTERNS = [
  /\bTop \d+ CV changes\b/gi,
  /\bThe strongest evidence I would bring into this application is\b/gi,
  /\bcv\.md:\d+(?:-\d+)?\b/gi,
  /\barticle-digest\.md:\d+(?:-\d+)?\b/gi,
  /\bCurrent state\b/gi,
  /\bProposed change\b/gi,
  /\bGenerated CV emphasizes\b/gi,
  /\bI would tailor this application around\b/gi,
];

const SUPPORTED_SIGNAL_ALIASES = [
  {
    term: 'AI agents',
    patterns: [/\bAI agent\b/i, /\bagentic\b/i, /\bLLM\b/i, /tool-orchestrat/i],
  },
  {
    term: 'Agentic workflows',
    patterns: [/\bagentic\b/i, /tool-orchestrat/i, /workflow/i, /\bLLM\b/i],
  },
  {
    term: 'LLM orchestration',
    patterns: [/\bLLM\b/i, /Vercel AI SDK/i, /tool-orchestrat/i, /Function Calling/i],
  },
  {
    term: 'Tool orchestration',
    patterns: [/tool-orchestrat/i, /typed tools/i, /Function Calling/i, /Vercel AI SDK/i],
  },
  {
    term: 'Workflow orchestration',
    patterns: [/workflow/i, /orchestrat/i, /BullMQ/i, /Airflow/i],
  },
  {
    term: 'RAG',
    patterns: [/\bRAG\b/i, /retrieval/i, /pgvector/i, /embeddings/i, /vector database/i],
  },
  {
    term: 'Distributed Systems',
    patterns: [/distributed/i, /RabbitMQ/i, /Redis/i, /WebSocket/i, /microservices/i, /concurrent/i, /\bQPS\b/i],
  },
  {
    term: 'High-concurrency',
    patterns: [/high-concurrency/i, /concurrent/i, /\bQPS\b/i, /WebSocket/i, /epoll/i],
  },
  {
    term: 'Event-driven architecture',
    patterns: [/event-driven/i, /RabbitMQ/i, /WebSocket/i, /outbox/i, /message/i],
  },
  {
    term: 'Real-time tracking',
    patterns: [/real-time/i, /WebSocket/i, /\bSSE\b/i, /streaming/i, /tracking/i],
  },
  {
    term: 'Observability',
    patterns: [/Prometheus/i, /Grafana/i, /telemetry/i, /metrics/i, /audit/i, /event log/i],
  },
  {
    term: 'Product ownership',
    patterns: [/owned/i, /shipped/i, /user feedback/i, /customer/i, /retention/i],
  },
  {
    term: 'Real-time collaboration',
    patterns: [/real-time/i, /WebSocket/i, /Redis/i, /multiplayer/i, /synchron/i],
  },
  {
    term: 'Polished front-end experiences',
    patterns: [/\bReact\b/i, /\bNext\.js\b/i, /front-end/i, /frontend/i, /Web Workers/i, /\bUI\b/i],
  },
  {
    term: 'Developer tooling and extensibility',
    patterns: [/typed tools/i, /Function Calling/i, /\bAPI\b/i, /\bOpenAPI\b/i, /Vercel AI SDK/i, /tool-orchestrat/i],
  },
  {
    term: 'Cross-functional collaboration',
    patterns: [/cross-functional/i, /customer feedback/i, /analysts/i, /GIS specialists/i, /stakeholders/i],
  },
  {
    term: 'AI-native development',
    patterns: [/AI-native/i, /Claude Code/i, /Codex/i, /harness-engineering/i],
  },
  {
    term: 'Security',
    patterns: [/OAuth2/i, /\bJWT\b/i, /\bRBAC\b/i, /Spring Security/i, /rate limiting/i, /signature/i],
  },
  {
    term: 'CI/CD',
    patterns: [/CI\/CD/i, /GitHub Actions/i, /deployment/i, /deployed/i],
  },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripMarkdown(value) {
  return String(value ?? '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchText(value) {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/node\.js/g, 'nodejs')
    .replace(/next\.js/g, 'nextjs')
    .replace(/ci\/cd/g, 'cicd')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExactSignalTerm(term, text) {
  const rawTerm = stripMarkdown(term);
  if (!rawTerm) return false;
  if (/^[A-Za-z0-9+#./-]{1,16}$/.test(rawTerm)) {
    const escaped = rawTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9+.#])${escaped}([^A-Za-z0-9+.#]|$)`, 'i').test(String(text ?? ''));
  }
  return normalizeSearchText(text).includes(normalizeSearchText(rawTerm));
}

function tokenSet(value) {
  return new Set(normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function meaningfulTokens(value) {
  return [...tokenSet(value)];
}

function scoreTokensAgainstText(value, searchText) {
  const tokens = meaningfulTokens(value);
  if (!tokens.length) return 0;
  const haystack = tokenSet(searchText);
  const matched = tokens.filter((token) => haystack.has(token));
  return matched.length / tokens.length;
}

function requiresLlmWorkflowContext(term) {
  return /^(ai agents?|agentic workflows?|llm orchestration|tool orchestration|workflow orchestration)$/i.test(stripMarkdown(term));
}

function hasLlmWorkflowContext(text) {
  return /\b(LLM|RAG|tool-orchestrat|workflow|Vercel AI SDK|Function Calling|OpenAI|LangChain|agent platform|agentic)\b/i.test(text);
}

function clipText(value, max = 900) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}...`;
}

function sentenceJoin(items) {
  const parts = items.filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function lowerFirst(value) {
  const text = String(value ?? '').trim();
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : '';
}

function sanitizeApplicationCopy(value) {
  let text = String(value ?? '');
  for (const pattern of FORBIDDEN_APPLICATION_TEXT_PATTERNS) {
    text = text.replace(pattern, '');
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function isDesignLedFullStackRole(row, roleSignals) {
  const company = String(row?.company ?? '').toLowerCase();
  if (company.includes('figma')) return true;
  return Boolean(roleSignals?.flags?.frontend && roleSignals?.flags?.product && (roleSignals?.flags?.realtime || roleSignals?.flags?.extensibility));
}

function slugify(value, fallback = 'document') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return slug || fallback;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function displayUrl(value) {
  return String(value ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

async function readText(relPath, fallback = '') {
  const abs = join(ROOT, relPath);
  return existsSync(abs) ? readFile(abs, 'utf8') : fallback;
}

async function loadProfile() {
  const raw = await readText('config/profile.yml', '');
  if (!raw.trim()) return {};
  return yaml.load(raw) || {};
}

function resolveReportPath(reportPath) {
  if (!reportPath) return null;
  if (!/^reports\/\d{3}-.+\.md$/.test(reportPath)) {
    throw new ClientError('invalid reportPath');
  }
  const reportsDir = resolve(ROOT, 'reports');
  const abs = resolve(ROOT, reportPath);
  if (!abs.startsWith(`${reportsDir}${sep}`)) {
    throw new ClientError('invalid reportPath');
  }
  if (!existsSync(abs)) {
    throw new ClientError('reportPath does not exist', 404);
  }
  return abs;
}

function extractReportSection(content, letter) {
  const heading = new RegExp(`^##\\s+${letter}\\)\\s+.*$`, 'mi');
  const match = heading.exec(content || '');
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+[A-Z]\)\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function parseMarkdownTable(section) {
  const rows = section.split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => stripMarkdown(cell)));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => normalizeSearchText(header));
  return rows.slice(1)
    .filter((cells) => !cells.every((cell) => /^[-:\s]+$/.test(cell)))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

function extractTableValue(section, labels) {
  const rows = parseMarkdownTable(section);
  const wanted = new Set(labels.map((label) => normalizeSearchText(label)));
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length < 2) continue;
    const label = row[keys[0]];
    if (wanted.has(normalizeSearchText(label))) {
      return row[keys[1]];
    }
  }
  return '';
}

function extractListItems(section) {
  return section.split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1])
    .filter(Boolean)
    .map(stripMarkdown)
    .filter(Boolean);
}

function splitKeywordLine(value) {
  return String(value ?? '')
    .split(/[,;|]/)
    .map(stripMarkdown)
    .map((item) => item.replace(/^keywords?\s*(extracted|extra[ií]das?)?\s*:?\s*/i, '').trim())
    .filter((item) => item.length > 1);
}

function extractTrailingKeywordSection(reportContent) {
  const match = /(?:^|\n)##\s+Keywords(?:\s+extra[ií]das?| extracted)?\s*\n([\s\S]+)$/i.exec(reportContent || '');
  return match ? splitKeywordLine(match[1]) : [];
}

function extractRequirementRows(reportContent) {
  const rows = parseMarkdownTable(extractReportSection(reportContent, 'B'));
  return rows.map((row) => {
    const keys = Object.keys(row);
    const requirementKey = keys.find((key) => /requirement|requisito|signal/.test(key)) || keys[0];
    const evidenceKey = keys.find((key) => /evidence|proof|cv/.test(key)) || keys[keys.length - 1];
    return {
      requirement: row[requirementKey] || '',
      evidence: row[evidenceKey] || '',
    };
  }).filter((row) => row.requirement);
}

function extractRoleMetadata(reportContent) {
  const sectionA = extractReportSection(reportContent, 'A');
  return {
    archetype: sanitizeApplicationCopy(extractTableValue(sectionA, ['Arquetipo detectado', 'Archetype'])),
    domain: sanitizeApplicationCopy(extractTableValue(sectionA, ['Domain'])),
    fn: sanitizeApplicationCopy(extractTableValue(sectionA, ['Function'])),
    seniority: sanitizeApplicationCopy(extractTableValue(sectionA, ['Seniority'])),
    tlDr: sanitizeApplicationCopy(extractTableValue(sectionA, ['TL;DR'])),
  };
}

function supportsSignal(term, text) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return false;
  if (requiresLlmWorkflowContext(term) && !hasLlmWorkflowContext(text)) return false;
  if (hasExactSignalTerm(term, text)) return true;

  const alias = SUPPORTED_SIGNAL_ALIASES.find((entry) => normalizeSearchText(entry.term) === normalizedTerm);
  if (alias?.patterns.some((pattern) => pattern.test(text))) return true;

  const tokenScore = scoreTokensAgainstText(term, text);
  return meaningfulTokens(term).length >= 2 && tokenScore >= 0.67;
}

function scoreSignalAgainstText(term, text) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return 0;
  if (requiresLlmWorkflowContext(term) && !hasLlmWorkflowContext(text)) return 0;
  if (hasExactSignalTerm(term, text)) return 8 + meaningfulTokens(term).length;

  const alias = SUPPORTED_SIGNAL_ALIASES.find((entry) => normalizeSearchText(entry.term) === normalizedTerm);
  if (alias?.patterns.some((pattern) => pattern.test(text))) return 6;

  const tokenScore = scoreTokensAgainstText(term, text);
  if (tokenScore >= 0.67) return 4 * tokenScore;
  if (tokenScore >= 0.4) return 1.5 * tokenScore;
  return 0;
}

function extractKnownTechTerms(text) {
  return TECH_TERMS.filter((term) => supportsSignal(term, text));
}

function buildRoleSignals(row, reportContent, cvMarkdown) {
  const metadata = extractRoleMetadata(reportContent);
  const requirements = extractRequirementRows(reportContent);
  const keywords = extractTrailingKeywordSection(reportContent);
  const jobText = [
    row.company,
    row.role,
    metadata.domain,
    metadata.fn,
    metadata.seniority,
    metadata.tlDr,
    ...requirements.map((item) => item.requirement),
    ...keywords,
  ].join('\n');

  const rawPhrases = [
    row.role,
    metadata.domain,
    metadata.fn,
    ...keywords,
    ...extractKnownTechTerms(jobText),
    ...requirements.map((item) => item.requirement),
  ];

  const priorityPhrases = unique(rawPhrases)
    .filter((term) => term.length <= 90)
    .filter((term) => !/^(bs|ms|degree|sponsorship|salary|bonus|equity|hybrid|remote|pittsburgh|months of experience)/i.test(term))
    .filter((term) => !/(ai forward deployed|technical ai product manager|llmops|north star)/i.test(term));

  const supportedPhrases = priorityPhrases.filter((term) => supportsSignal(term, cvMarkdown));

  const flags = Object.fromEntries(ROLE_THEME_DEFINITIONS.map((theme) => [
    theme.key,
    theme.patterns.some((pattern) => pattern.test(jobText)),
  ]));

  const focusThemes = ROLE_THEME_DEFINITIONS
    .filter((theme) => flags[theme.key])
    .map((theme) => theme.label)
    .slice(0, 4);

  return {
    jobText,
    requirements,
    metadata,
    keywords,
    priorityPhrases,
    supportedPhrases,
    focusThemes,
    flags,
    designLedFullStack: isDesignLedFullStackRole(row, { flags }),
    tokens: tokenSet(jobText),
  };
}

function normalizeSkillTerm(term) {
  const clean = stripMarkdown(term)
    .replace(/^onboard\s*\/\s*/i, '')
    .replace(/^direct\s+/i, '')
    .replace(/^large-scale\s+/i, '')
    .replace(/^strong proficiency in /i, '')
    .trim();
  const normalized = normalizeSearchText(clean);
  if (normalized === 'cplusplus or python ideally both') return 'C++ and Python';
  if (normalized === 'cloud compute and batch workflow management') return 'Cloud and workflow management';
  if (normalized === 'model training and evaluation pipelines') return 'Model training and evaluation';
  if (normalized === 'model training evaluation pipelines') return 'Model training and evaluation';
  if (normalized === 'low latency inference infrastructure') return 'Low-latency inference';
  if (normalized === 'modern front end frameworks eg react typescript') return 'React and TypeScript';
  if (normalized === 'polished front end experiences') return 'Polished front-end experiences';
  if (normalized === 'developer tooling and extensibility') return 'Developer tooling and extensibility';
  if (normalized === 'cross functional product collaboration') return 'Cross-functional collaboration';
  if (normalized === '0 to 1 product ownership') return '0-to-1 product ownership';
  if (normalized === 'real time collaboration') return 'Real-time collaboration';
  if (normalized === 'reliability and observability') return 'Reliability and observability';
  return clean;
}

function extractKeySkills(reportContent, cvMarkdown, roleSignals) {
  const baseTerms = unique([
    ...(roleSignals?.keywords || []),
    ...(roleSignals?.focusThemes || []),
    ...(roleSignals?.supportedPhrases || []),
    ...extractKnownTechTerms(reportContent),
    ...extractKnownTechTerms(cvMarkdown),
  ]);

  const productTerms = roleSignals.designLedFullStack
    ? [
      'React',
      'TypeScript',
      'Next.js',
      'PostgreSQL',
      'Redis',
      'WebSocket',
      'Real-time collaboration',
      'Developer tooling and extensibility',
      'Polished front-end experiences',
      'Reliability and observability',
      '0-to-1 product ownership',
      'C++',
      'Python',
    ]
    : [];

  if (roleSignals.designLedFullStack) {
    return unique(productTerms.map(normalizeSkillTerm))
      .filter((term) => term.length <= 36)
      .filter((term) => !/^(design|data|research)$/i.test(term))
      .filter((term) => /^(React|TypeScript|Next\.js|PostgreSQL|Redis|WebSocket|Real-time collaboration|Developer tooling and extensibility|Polished front-end experiences|Reliability and observability|0-to-1 product ownership|C\+\+|Python)$/i.test(term))
      .filter((term) => ['Real-time collaboration', 'Polished front-end experiences', 'Developer tooling and extensibility', 'Reliability and observability', '0-to-1 product ownership'].includes(term) || supportsSignal(term, cvMarkdown))
      .slice(0, 12);
  }

  return unique(baseTerms.concat(productTerms)
    .map(normalizeSkillTerm)
    .filter((term) => term.length <= 36)
    .filter((term) => (term.match(/\b[\w+/.-]+\b/g) || []).length <= 5)
    .filter((term) => !/^(software engineer|autonomous vehicles|behavior planning ml infrastructure)$/i.test(term))
    .filter((term) => roleSignals.focusThemes.includes(term) || supportsSignal(term, cvMarkdown))
    .sort((a, b) => scoreSignalAgainstText(b, roleSignals?.jobText || reportContent) - scoreSignalAgainstText(a, roleSignals?.jobText || reportContent))
  )
    .slice(0, 12);
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const clean = stripMarkdown(item);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function sectionBetween(markdown, heading) {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const match = pattern.exec(markdown);
  if (!match) return '';
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function splitSubsections(section) {
  return section
    .split(/^###\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.split('\n').map((line) => line.trim()).filter(Boolean));
}

function parseWorkEntries(cvMarkdown) {
  return splitSubsections(sectionBetween(cvMarkdown, 'Work Experience')).map((lines) => ({
    company: stripMarkdown(lines[0]),
    role: stripMarkdown(lines[1]),
    location: stripMarkdown(lines[2]),
    period: stripMarkdown(lines[3]),
    bullets: lines.filter((line) => line.startsWith('- ')).map((line) => stripMarkdown(line.slice(2))),
  }));
}

function parseProjectEntries(cvMarkdown) {
  return splitSubsections(sectionBetween(cvMarkdown, 'Project Experience')).map((lines) => {
    const techLine = lines.find((line) => /^\*\*Tech Stack:\*\*/.test(line));
    const nonBulletLines = lines.filter((line) => !line.startsWith('- '));
    const metaLines = nonBulletLines.slice(1).filter((line) => line !== techLine);
    const period = metaLines.find((line) => /\b(20\d{2}|present|jan\.?|feb\.?|mar\.?|apr\.?|may|jun\.?|jul\.?|aug\.?|sep\.?|oct\.?|nov\.?|dec\.?)\b/i.test(line)) || '';
    const description = metaLines.find((line) => line !== period) || '';
    return {
      title: stripMarkdown(lines[0]),
      description: stripMarkdown(description),
      period: stripMarkdown(period),
      tech: stripMarkdown((techLine || '').replace(/^\*\*Tech Stack:\*\*\s*/, '')),
      bullets: lines.filter((line) => line.startsWith('- ')).map((line) => stripMarkdown(line.slice(2))),
    };
  });
}

function parseEducationEntries(cvMarkdown) {
  return splitSubsections(sectionBetween(cvMarkdown, 'Education')).map((lines) => ({
    school: stripMarkdown(lines[0]),
    degree: stripMarkdown(lines[1]),
    location: stripMarkdown(lines[2]),
    period: stripMarkdown(lines[3]),
  }));
}

function parseSkillEntries(cvMarkdown) {
  return splitSubsections(sectionBetween(cvMarkdown, 'Skills')).map((lines) => ({
    category: stripMarkdown(lines[0]),
    skills: stripMarkdown(lines.slice(1).join(', ')),
  })).filter((entry) => entry.category && entry.skills);
}

function workSearchText(entry) {
  return [
    entry.company,
    entry.role,
    entry.location,
    entry.period,
    ...(entry.bullets || []),
  ].join(' ');
}

function projectSearchText(entry) {
  return [
    entry.title,
    entry.description,
    entry.period,
    entry.tech,
    ...(entry.bullets || []),
  ].join(' ');
}

function scoreBullet(bullet, roleSignals) {
  const keywordScore = [...roleSignals.tokens]
    .filter((token) => tokenSet(bullet).has(token))
    .length;
  const phraseScore = roleSignals.supportedPhrases
    .slice(0, 30)
    .reduce((score, phrase) => score + scoreSignalAgainstText(phrase, bullet), 0);
  const metricBoost = /\b\d+(?:\.\d+)?\s*(?:%|ms|K\+?|M\+?|QPS|concurrent|sessions|events|tools|pages|records)\b/i.test(bullet) ? 3 : 0;
  return keywordScore + phraseScore + metricBoost;
}

function themedTextScore(text, roleSignals) {
  let score = 0;
  if (roleSignals.flags.frontend && /(React|Next\.js|TypeScript|frontend|front-end|Web Workers|UI|browser)/i.test(text)) score += 20;
  if (roleSignals.flags.product && /(Owned end-to-end|shipped|launch|iteration|customer feedback|retention|product|analytics loops)/i.test(text)) score += 16;
  if (roleSignals.flags.realtime && /(WebSocket|Redis|multiplayer|synchron|real-time|tracking|concurrent players)/i.test(text)) score += 24;
  if (roleSignals.flags.extensibility && /(typed tools|Function Calling|OpenAPI|API|tool-orchestrated|Vercel AI SDK|broker-agnostic)/i.test(text)) score += 22;
  if (roleSignals.flags.crossFunctional && /(customer feedback|analysts|GIS specialists|cross-functional|stakeholders|team)/i.test(text)) score += 10;
  if (roleSignals.flags.observability && /(Prometheus|Grafana|telemetry|metrics|audit|event log|monitor)/i.test(text)) score += 12;
  if (roleSignals.flags.data && /(OpenStreetMap|ingestion|ETL|dataset|PySpark|GeoPandas|Airflow|BullMQ|retrieval|pipeline|batch)/i.test(text)) score += 18;
  if (roleSignals.flags.training && /(PyTorch|TensorFlow|training|evaluation|reinforcement learning|imitation learning|DAGGER|CNN|computer vision|policy|ablation|\bRL\b|POMDP|Stable-Baselines3|MaskablePPO)/i.test(text)) score += 28;
  if (roleSignals.flags.inference && /(inference|latency|real-time|streaming|interactive play|p99|service|deployment)/i.test(text)) score += 18;
  if (roleSignals.flags.systems && /(C\+\+|Linux|epoll|Valgrind|concurr|memory|pthread|proxy|xv6|HTTP\/1\.1)/i.test(text)) score += 20;
  if (roleSignals.flags.cloud && /(Docker|AWS|workflow|RabbitMQ|Redis|GitHub Actions|BullMQ)/i.test(text)) score += 8;
  if (roleSignals.flags.training && roleSignals.flags.inference && /(Battleship|POMDP|DAgger|MaskablePPO|Stable-Baselines3|Monte Carlo Inference|interactive play)/i.test(text)) score += 34;
  if (roleSignals.flags.systems && roleSignals.flags.inference && /(HTTP\/1\.1|proxy|epoll|p99 latency)/i.test(text)) score += 22;
  if (roleSignals.flags.training && /Next\.js|React|frontend|Web Workers|coaching|multiplayer/i.test(text) && !/(PyTorch|training|evaluation|inference|POMDP|Stable-Baselines3|policy)/i.test(text)) score -= 22;
  if (roleSignals.flags.training && /RAG|agent platform|tool-orchestrated|Vercel AI SDK|SEC filings/i.test(text) && !/(PyTorch|training|evaluation|inference|POMDP|Monte Carlo)/i.test(text)) score -= 18;
  if (roleSignals.designLedFullStack && /(POMDP|DAgger|Stable-Baselines3|Gymnasium|GAN|VAE|Autoencoder|RBM|Monte Carlo Inference)/i.test(text)) score -= 22;
  if (roleSignals.designLedFullStack && /(Linux epoll|Valgrind|xv6|copy-on-write|page-table|allocator)/i.test(text) && !/(React|WebSocket|user-facing|tracking|browser|UI)/i.test(text)) score -= 8;
  return score;
}

function matchedProjectTerms(entry, roleSignals, limit = 5) {
  const text = projectSearchText(entry);
  if (roleSignals.designLedFullStack) {
    const preferredTerms = [
      { term: 'Real-time collaboration', test: /(\bWebSocket\b|\bmultiplayer\b|\bshared state\b|\bbidirectional\b|\bconcurrent players\b|\btracking\b|\bSTOMP\b|\bcollabor(?:ation|ative)?\b)/i },
      { term: 'Polished front-end experiences', test: /(\bReact\b|\bNext\.js\b|\bWeb Workers\b|\bbrowser\b|\bfrontend\b|\bfront-end\b|\bUI\b|\bUX\b)/i },
      { term: '0-to-1 product ownership', test: /(Owned end-to-end|launch|shipment|iteration|retention|customer feedback)/i },
      { term: 'Developer tooling and extensibility', test: /(typed tools|Vercel AI SDK|Function Calling|OpenAPI|tool-orchestrated|API contracts|broker-agnostic)/i },
      { term: 'Reliability and observability', test: /(Prometheus|Grafana|telemetry|metrics|audit|event log|monitor|CI\/CD)/i },
      { term: 'Cross-functional collaboration', test: /(customer feedback|analysts|GIS specialists|stakeholders|cross-functional|team)/i },
      { term: 'React', test: /\bReact\b/i },
      { term: 'TypeScript', test: /\bTypeScript\b/i },
      { term: 'Next.js', test: /\bNext\.js\b/i },
      { term: 'PostgreSQL', test: /\bPostgreSQL\b/i },
      { term: 'Redis', test: /\bRedis\b/i },
      { term: 'WebSocket', test: /\bWebSocket\b/i },
      { term: 'C++', test: /\bC\+\+\b/i },
      { term: 'Python', test: /\bPython\b/i },
    ];
    return preferredTerms
      .filter((item) => item.test.test(text))
      .map((item) => item.term)
      .slice(0, limit);
  }

  return unique(roleSignals.priorityPhrases)
    .map((term) => ({ term, score: scoreSignalAgainstText(term, text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.term.length - b.term.length)
    .map((item) => normalizeSkillTerm(item.term))
    .filter((term) => term.length <= 36)
    .filter((term) => !/^(software engineer|autonomous vehicles|behavior planning ml infrastructure)$/i.test(term))
    .filter((term) => !/^(data|research|design|product|function|domain|software engineer, full stack)$/i.test(term))
    .filter(Boolean)
    .filter((term, index, items) => items.findIndex((value) => value.toLowerCase() === term.toLowerCase()) === index)
    .slice(0, limit);
}

function projectMentionScore(entry, roleSignals) {
  const reportText = roleSignals.jobText;
  if (hasExactSignalTerm(entry.title, reportText)) return 45;
  const titleTokens = meaningfulTokens(entry.title);
  const reportTokens = tokenSet(reportText);
  const titleMatches = titleTokens.filter((token) => reportTokens.has(token)).length;
  const titleScore = titleTokens.length ? (titleMatches / titleTokens.length) * 35 : 0;
  const partialTitleScore = titleMatches >= 2 ? 30 : 0;
  const descScore = entry.description && hasExactSignalTerm(entry.description, reportText) ? 12 : 0;
  return Math.max(titleScore, partialTitleScore) + descScore;
}

function projectRelevanceScore(entry, roleSignals) {
  const text = projectSearchText(entry);
  const phraseScore = roleSignals.supportedPhrases
    .reduce((score, phrase) => score + scoreSignalAgainstText(phrase, text), 0);
  const tokenScore = [...roleSignals.tokens]
    .filter((token) => tokenSet(text).has(token))
    .length;
  const metricScore = (text.match(/\b\d+(?:\.\d+)?\s*(?:%|ms|K\+?|M\+?|QPS|concurrent|sessions|events|tools|records)\b/gi) || []).length;
  return projectMentionScore(entry, roleSignals) + phraseScore + tokenScore + metricScore + themedTextScore(text, roleSignals);
}

function insertLeadAdjective(text, adjective) {
  const leadArticle = /^(Built|Engineered|Architected|Designed|Implemented|Optimized) (a|an|the)\b/.exec(text);
  if (leadArticle) {
    const article = leadArticle[2] === 'the'
      ? 'the'
      : (/^[aeiou]/i.test(adjective) ? 'an' : 'a');
    return text.replace(leadArticle[0], `${leadArticle[1]} ${article} ${adjective}`);
  }
  const leadVerb = /^(Built|Engineered|Architected|Designed|Implemented|Optimized)\b/.exec(text);
  if (leadVerb) {
    return text.replace(leadVerb[0], `${leadVerb[1]} ${adjective}`);
  }
  return text;
}

function buildProjectDescription(entry, roleSignals) {
  const text = projectSearchText(entry);
  if (roleSignals.designLedFullStack && /Casino Training Pro/i.test(entry.title)) {
    return 'Real-time collaborative web product with synchronized multiplayer state, analytics loops, and polished browser interactions.';
  }
  if (roleSignals.designLedFullStack && /Autonomous Investment Research/i.test(entry.title)) {
    return 'MCP-style extensibility platform exposing typed tools and API workflows for natural-language product interactions.';
  }
  if (roleSignals.designLedFullStack && /Mini-UPS/i.test(entry.title)) {
    return 'Full-stack logistics platform with live tracking, distributed messaging, and user-facing real-time updates.';
  }
  if (roleSignals.designLedFullStack && /Coffee Chat/i.test(entry.title)) {
    return 'User-facing matching product with recommendation workflows, onboarding, and feedback-driven iteration.';
  }
  if (roleSignals.flags.training && /(POMDP|reinforcement learning|DAgger|MaskablePPO|Gymnasium|Stable-Baselines3|imitation learning|\bRL\b|Monte Carlo Inference)/i.test(text) && /(policy|inference|evaluation|\bRL\b|imitation learning)/i.test(text)) {
    return 'Behavior-policy training, evaluation, and inference system for a large-action partially observed environment.';
  }
  if (roleSignals.flags.training && /(computer vision|GAN|VAE|PyTorch|ResNet|Autoencoder|RBM)/i.test(text)) {
    return 'PyTorch experimentation portfolio for model training, evaluation, and computer-vision workflows.';
  }
  if (roleSignals.flags.systems && /(HTTP\/1\.1|proxy|epoll|Valgrind|C\+\+17)/i.test(text)) {
    return 'C++/Linux systems project focused on concurrency, profiling, and low-latency service behavior.';
  }
  if (roleSignals.flags.data && /(pgvector|BullMQ|retrieval|event log|telemetry|Redis Lua)/i.test(text)) {
    return 'AI platform project focused on ingestion, retrieval pipelines, and production observability.';
  }
  if (roleSignals.flags.systems && /(RabbitMQ|WebSocket|transactional outbox|15K QPS|distributed ID)/i.test(text)) {
    return 'Distributed systems project centered on event-driven workflows, real-time state propagation, and service scalability.';
  }
  return sanitizeApplicationCopy(entry.description);
}

function tailorProjectBullet(bullet, entry, roleSignals) {
  let text = bullet;
  const roleText = roleSignals.jobText;

  if (roleSignals.designLedFullStack && /Owned end-to-end design, implementation, and shipment/i.test(text)) {
    text = text.replace(/Owned end-to-end design, implementation, and shipment/i, 'Owned 0-to-1 product design, implementation, launch, and iteration');
  }

  if (roleSignals.designLedFullStack && /WebSockets for bidirectional communication and Redis for distributed state synchronization/i.test(text)) {
    text = text.replace(/using WebSockets for bidirectional communication and Redis for distributed state synchronization across active sessions/i, 'using WebSockets and Redis to keep shared state synchronized across active sessions and make real-time collaboration feel seamless');
  }

  if (roleSignals.designLedFullStack && /Web Workers/i.test(text)) {
    text = text.replace(/keeping the main thread responsive during analysis over 72,000\+ arrangement branches/i, 'keeping the browser UI smooth during heavy analysis over 72,000+ arrangement branches');
  }

  if (roleSignals.designLedFullStack && /typed tools/i.test(text)) {
    text = text.replace(/Architected LLM tool orchestration with the Vercel AI SDK, exposing 20\+ typed tools across market data, technical indicators, news, research, and trading workflows\./i, 'Built an MCP-style extensibility layer with the Vercel AI SDK, exposing 20+ typed tools and API contracts for natural-language workflows across market data, research, and trading actions.');
  }

  if (roleSignals.designLedFullStack && /Built a full-stack AI agent platform for financial analysis/i.test(text)) {
    text = text.replace(/Built a full-stack AI agent platform for financial analysis with tool-orchestrated workflows, broker-agnostic trade execution, and a configurable multi-stage RAG stack over SEC filings, research, and market news\./i, 'Built a full-stack MCP-style product platform for natural-language financial research, combining typed tool workflows, broker-agnostic actions, and a configurable retrieval stack over filings, research, and market news.');
  }

  if (roleSignals.designLedFullStack && /SSE streaming/i.test(text)) {
    text = text.replace(/Engineered SSE streaming for real-time chat responses/i, 'Engineered streaming responses for real-time product interactions');
  }

  if (roleSignals.designLedFullStack && /React frontend receiving live updates via WebSocket and STOMP/i.test(text)) {
    text = text.replace(/Built a high-concurrency tracking system with a React frontend receiving live updates via WebSocket and STOMP from a RabbitMQ messaging pipeline, reducing latency by 40%./i, 'Built a full-stack live-tracking experience with a React frontend receiving real-time WebSocket and STOMP updates from a RabbitMQ pipeline, reducing latency by 40%.');
  }

  if (/full-stack|end-to-end/i.test(roleText)
    && /frontend|React|Next\.js|UI/i.test(text)
    && /backend|NestJS|Spring Boot|Node\.js|PostgreSQL|Redis|RabbitMQ/i.test(text)
    && /^(Built|Engineered|Architected|Designed)\b/.test(text)
    && !/full-stack|end-to-end/i.test(text)) {
    text = insertLeadAdjective(text, 'full-stack');
  }

  if (/reliable backend|production reliability|scale|scalable/i.test(roleText)
    && /Redis|RabbitMQ|PostgreSQL|Prometheus|telemetry|audit|latency|QPS|concurrent/i.test(text)
    && !/reliable|scalable|production/i.test(text)) {
    text = insertLeadAdjective(text, 'production-grade');
  }

  if (roleSignals.flags.data && /OpenStreetMap data ingestion/i.test(text)) {
    text = text.replace(/Contributed to the automation of nationwide OpenStreetMap data ingestion/i, 'Scaled a nationwide geospatial data extraction and ingestion pipeline');
  }

  if (roleSignals.flags.data && /distributed road-name matching pipeline/i.test(text) && !/model-ready|evaluation-ready/i.test(text)) {
    text = text.replace(/distributed road-name matching pipeline/i, 'evaluation-ready distributed road-name matching pipeline');
  }

  if (roleSignals.flags.training && /evaluation harness/i.test(text)) {
    text = text.replace(/evaluation harness/gi, 'model-evaluation harness');
  }

  if (roleSignals.flags.training && /^Trained a /i.test(text)) {
    text = text.replace(/^Trained a /i, 'Trained and evaluated a ');
  }

  if (roleSignals.flags.inference && /production mc and rl inference modes/i.test(text)) {
    text = text.replace(/Deployed production mc and rl inference modes/i, 'Deployed low-latency inference services for Monte Carlo and RL policies');
  }

  if (roleSignals.flags.systems && /high-concurrency HTTP\/1\.1 caching proxy server/i.test(text) && !/low-latency/i.test(text)) {
    text = text.replace(/Developed a high-concurrency HTTP\/1\.1 caching proxy server/i, 'Built a high-concurrency, low-latency HTTP/1.1 caching proxy service');
  }

  if (roleSignals.flags.systems && /event-driven server around the Linux epoll API/i.test(text) && !/soft-real-time/i.test(text)) {
    text = text.replace(/Architected an event-driven server around the Linux epoll API/i, 'Architected a soft-real-time event-driven server around the Linux epoll API');
  }

  return sanitizeApplicationCopy(text);
}

function projectMatchesTheme(entry, theme) {
  const text = projectSearchText(entry);
  if (theme === 'frontend') return /(React|Next\.js|TypeScript|Web Workers|browser|frontend|front-end|UI)/i.test(text);
  if (theme === 'product') return /(Owned end-to-end|launch|shipment|customer feedback|retention|analytics loops|onboarding|iteration)/i.test(text);
  if (theme === 'realtime') return /(WebSocket|Redis|multiplayer|synchron|real-time|tracking)/i.test(text);
  if (theme === 'extensibility') return /(typed tools|Function Calling|OpenAPI|tool-orchestrated|Vercel AI SDK|broker-agnostic|API)/i.test(text);
  if (theme === 'training') return /(PyTorch|TensorFlow|POMDP|Stable-Baselines3|MaskablePPO|DAgger|Gymnasium|computer vision|evaluation|policy|\bRL\b)/i.test(text);
  if (theme === 'systems') return /(C\+\+|Linux|epoll|Valgrind|proxy|HTTP\/1\.1|xv6|memory management|pthread)/i.test(text);
  if (theme === 'data') return /(BullMQ|retrieval|event log|RabbitMQ|workflow|ingestion|pipeline|batch|Docker|AWS|Redis)/i.test(text);
  return false;
}

function selectedProjectPriority(entry, roleSignals) {
  let score = entry.relevanceScore || 0;
  if (roleSignals.designLedFullStack) {
    const hasFrontend = projectMatchesTheme(entry, 'frontend');
    const hasRealtime = projectMatchesTheme(entry, 'realtime');
    const hasProduct = projectMatchesTheme(entry, 'product');
    const hasExtensibility = projectMatchesTheme(entry, 'extensibility');

    if (hasFrontend) score += 80;
    if (hasRealtime) score += 70;
    if (hasProduct) score += 60;
    if (hasExtensibility) score += 40;
    if (hasFrontend && hasRealtime && hasProduct) score += 120;
    if (hasFrontend && hasRealtime && !hasProduct) score += 70;
    if (hasExtensibility && !hasFrontend && !hasRealtime) score -= 40;
    if (/Casino Training Pro/i.test(entry.title)) score += 60;
    if (/Mini-UPS/i.test(entry.title)) score += 40;
    if (/Autonomous Investment Research/i.test(entry.title)) score -= 30;
  }
  return score;
}

function preferredThemeOrder(roleSignals) {
  if (roleSignals.designLedFullStack) {
    return ['realtime', 'extensibility', 'frontend', 'product'];
  }
  return [
    roleSignals.flags.training ? 'training' : '',
    roleSignals.flags.systems ? 'systems' : '',
  ].filter(Boolean);
}

function tailorProjectEntries(entries, roleSignals) {
  const ranked = entries
    .map((entry, index) => {
      const bulletScores = entry.bullets
        .map((bullet, bulletIndex) => ({
          bullet: tailorProjectBullet(bullet, entry, roleSignals),
          score: scoreBullet(bullet, roleSignals),
          bulletIndex,
        }))
        .sort((a, b) => b.score - a.score || a.bulletIndex - b.bulletIndex)
        .slice(0, 4)
        .map((item) => item.bullet);
      return {
        ...entry,
        sourceIndex: index,
        relevanceScore: projectRelevanceScore(entry, roleSignals),
        matchedTerms: matchedProjectTerms(entry, roleSignals),
        description: buildProjectDescription(entry, roleSignals),
        bullets: bulletScores,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.sourceIndex - b.sourceIndex);

  const selected = [];
  const themeOrder = preferredThemeOrder(roleSignals);

  for (const theme of themeOrder) {
    const match = ranked.find((entry) => !selected.includes(entry) && projectMatchesTheme(entry, theme));
    if (match) selected.push(match);
  }

  for (const entry of ranked) {
    if (selected.includes(entry)) continue;
    selected.push(entry);
    if (selected.length >= 3) break;
  }

  return selected
    .slice(0, 3)
    .sort((a, b) => selectedProjectPriority(b, roleSignals) - selectedProjectPriority(a, roleSignals));
}

function tailorWorkBullet(bullet, roleSignals) {
  let text = bullet;
  if (roleSignals.flags.data && /automation of nationwide OpenStreetMap data ingestion/i.test(text)) {
    text = text.replace(/Contributed to the automation of nationwide OpenStreetMap data ingestion/i, 'Built a large-scale OpenStreetMap data extraction and ingestion pipeline');
  }
  if (roleSignals.flags.data && /PySpark/i.test(text) && !/batch/i.test(text)) {
    text = insertLeadAdjective(text, 'batch-data');
  }
  if (roleSignals.flags.cloud && /Docker and Airflow/i.test(text) && !/workflow/i.test(text)) {
    text = text.replace(/containerized the workflow with Docker and Airflow/i, 'containerized and scheduled the workflow with Docker and Airflow');
  }
  return sanitizeApplicationCopy(text);
}

function tailorWorkEntries(entries, roleSignals) {
  return entries.map((entry) => ({
    ...entry,
    bullets: entry.bullets
      .map((bullet, bulletIndex) => ({
        bullet: tailorWorkBullet(bullet, roleSignals),
        bulletIndex,
        score: scoreBullet(bullet, roleSignals) + themedTextScore(bullet, roleSignals),
      }))
      .sort((a, b) => b.score - a.score || a.bulletIndex - b.bulletIndex)
      .map((item) => item.bullet),
  }));
}

function parseCvContact(cvMarkdown) {
  return {
    name: stripMarkdown((cvMarkdown.match(/^#\s+(.+)$/m) || [])[1] || 'Hongxi Chen'),
    email: stripMarkdown((cvMarkdown.match(/\*\*Email:\*\*\s*(.+)/) || [])[1] || ''),
    phone: stripMarkdown((cvMarkdown.match(/\*\*Mobile:\*\*\s*(.+)/) || [])[1] || ''),
    github: stripMarkdown((cvMarkdown.match(/\*\*GitHub:\*\*\s*(.+)/) || [])[1] || ''),
  };
}

function renderExperience(entries) {
  return entries.map((entry) => `
    <div class="job avoid-break">
      <div class="job-header">
        <div class="job-company">${escapeHtml(entry.company)}</div>
        <div class="job-period">${escapeHtml(entry.period)}</div>
      </div>
      <div class="job-role">${escapeHtml(entry.role)} <span class="job-location">${escapeHtml(entry.location)}</span></div>
      <ul>
        ${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('\n')}
      </ul>
    </div>
  `).join('\n');
}

function renderProjects(entries) {
  return entries.map((entry) => `
    <div class="project avoid-break">
      <div class="project-header">
        <div class="project-title">${escapeHtml(entry.title)}</div>
        ${entry.period ? `<div class="project-badge">${escapeHtml(entry.period)}</div>` : ''}
      </div>
      ${entry.description ? `<div class="project-desc">${escapeHtml(entry.description)}</div>` : ''}
      ${entry.tech ? `<div class="project-tech"><span>Tech Stack:</span> ${escapeHtml(entry.tech)}</div>` : ''}
      ${entry.matchedTerms?.length ? `<div class="project-focus"><span>Relevant Focus:</span> ${entry.matchedTerms.map(escapeHtml).join(', ')}</div>` : ''}
      <ul>
        ${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('\n')}
      </ul>
    </div>
  `).join('\n');
}

function buildTailoredSkillEntries(cvMarkdown, roleSignals) {
  const roleAwareGroups = roleSignals.designLedFullStack
    ? [
      { category: 'Frontend & Product', terms: ['React', 'TypeScript', 'Next.js', 'JavaScript', 'HTML/CSS', 'Web Workers'] },
      { category: 'Backend & APIs', terms: ['Node.js', 'Python', 'C++', 'PostgreSQL', 'Redis', 'REST', 'OpenAPI'] },
      { category: 'Realtime & Collaboration', terms: ['WebSocket', 'Redis', 'SSE', 'Distributed Systems', 'Event-driven architecture', 'Real-time collaboration'] },
      { category: 'Extensibility & Reliability', terms: ['Function Calling', 'Vercel AI SDK', 'Developer tooling and extensibility', 'CI/CD', 'Prometheus', 'Grafana'] },
    ]
    : [
      { category: 'Languages', terms: ['Python', 'C++', 'TypeScript', 'Java', 'SQL'] },
      { category: 'Platforms', terms: ['PyTorch', 'PySpark', 'PostgreSQL', 'Redis', 'Docker', 'AWS'] },
      { category: 'Systems', terms: ['Linux', 'WebSocket', 'Observability', 'CI/CD', 'Distributed Systems', 'Event-driven architecture'] },
    ];

  return roleAwareGroups
    .map((group) => ({
      category: group.category,
      skills: group.terms.filter((term) => supportsSignal(term, cvMarkdown)).slice(0, roleSignals.designLedFullStack ? 5 : 6),
    }))
    .filter((group) => group.skills.length >= 2);
}

function renderSkills(entries, roleSignals) {
  return entries.map((entry) => {
    const skills = Array.isArray(entry.skills)
      ? entry.skills
      : splitKeywordLine(entry.skills)
        .map((skill, index) => ({
          skill,
          index,
          score: Math.max(
            scoreSignalAgainstText(skill, roleSignals.jobText),
            [...roleSignals.tokens].some((token) => tokenSet(skill).has(token)) ? 1 : 0,
          ),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((item) => item.skill);
    return `
      <div class="skill-item"><span class="skill-category">${escapeHtml(entry.category)}:</span> ${escapeHtml(skills.join(', '))}</div>
    `;
  }).join('\n');
}

function renderCertifications(entries) {
  if (!entries.length) return '';
  return `
    <div class="section avoid-break">
      <div class="section-title">Certifications</div>
      ${entries.map((entry) => `
        <div class="cert-item">
          <div class="cert-title">${escapeHtml(entry.title || entry)}</div>
          ${entry.year ? `<div class="cert-year">${escapeHtml(entry.year)}</div>` : ''}
        </div>
      `).join('\n')}
      </div>
    `;
}

function renderEducation(entries) {
  return entries.map((entry) => `
    <div class="edu-item avoid-break">
      <div class="edu-header">
        <div class="edu-title">${escapeHtml(entry.degree)}</div>
        <div class="edu-year">${escapeHtml(entry.period)}</div>
      </div>
      <div class="edu-org">${escapeHtml(entry.school)}</div>
      <div class="edu-desc">${escapeHtml(entry.location)}</div>
    </div>
  `).join('\n');
}

function replaceTemplate(template, replacements) {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`unreplaced CV template placeholders: ${leftover.join(', ')}`);
  }
  return out;
}

function buildCvContactRow(contact, candidate, location, portfolio, linkedin) {
  const items = [
    escapeHtml(candidate.phone || contact.phone),
    escapeHtml(candidate.email || contact.email),
    linkedin ? `<a href="${escapeHtml(normalizeUrl(linkedin))}">${escapeHtml(displayUrl(linkedin))}</a>` : '',
    portfolio ? `<a href="${escapeHtml(normalizeUrl(portfolio))}">${escapeHtml(displayUrl(portfolio))}</a>` : '',
    location,
  ].filter(Boolean);

  return items.map((item) => `<span>${item}</span>`).join('\n<span class="separator">|</span>\n');
}

function collectDocumentEvidence(workEntries, projectEntries, roleSignals) {
  const workItems = workEntries.map((entry) => ({
    label: entry.company,
    summary: entry.bullets[0] || '',
    score: themedTextScore(workSearchText(entry), roleSignals),
    type: 'work',
  }));
  const projectItems = projectEntries.map((entry) => ({
    label: entry.title,
    summary: entry.bullets[0] || '',
    score: selectedProjectPriority(entry, roleSignals),
    type: 'project',
  }));
  if (roleSignals.designLedFullStack) {
    return [...projectItems, ...workItems]
      .filter((item) => item.summary)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'project' ? -1 : 1;
        return b.score - a.score;
      })
      .slice(0, 3);
  }
  return [...projectItems, ...workItems]
    .filter((item) => item.summary)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildCoverLetterParagraphs(row, roleSignals, workEntries, projectEntries) {
  if (roleSignals.designLedFullStack) {
    const evidence = collectDocumentEvidence(workEntries, projectEntries, roleSignals);
    const walkthrough = evidence[0]?.label || projectEntries[0]?.title || row.role;
    const productProjects = projectEntries.slice(0, 2);
    const extensibilityProject = projectEntries.find((entry) => projectMatchesTheme(entry, 'extensibility') && !productProjects.includes(entry));
    const projectLabel = (entry) => entry.title.split('/')[0].trim();
    const articleFor = (text) => (/^(?:[aeiou]|MCP)/i.test(text) ? 'an' : 'a');
    const second = productProjects.map((entry, index) => {
      const desc = (entry.description || '').replace(/[.]+$/, '');
      return `${index ? 'I also built' : 'I built'} ${projectLabel(entry)} as ${articleFor(desc)} ${lowerFirst(desc)}`;
    }).filter(Boolean);
    return [
      sanitizeApplicationCopy(clipText(
        `I am applying for the ${row.role} role at ${row.company} because I want to build collaborative products where engineering quality shows up directly in the user experience. Figma's mix of polished front-end craft, real-time collaboration, and extensible platform surfaces is exactly the kind of product environment I want to grow in.`,
        360,
      )),
      sanitizeApplicationCopy(clipText(
        second.length
          ? `${second.join('. ')}.`
          : `My strongest projects combine real-time product interactions, user-facing full-stack architecture, and API/platform design.`,
        360,
      )),
      sanitizeApplicationCopy(clipText(
        extensibilityProject
          ? `What stands out to me about ${row.company} is the tight collaboration with Product, Design, Research, and Data. I also built ${projectLabel(extensibilityProject)} as an MCP-style extensibility platform with typed tools and API workflows, which maps well to Figma's interest in developer tooling and APIs.`
          : `What stands out to me about ${row.company} is the expectation that engineers work closely with Product, Design, Research, and Data while still owning performance, reliability, and iteration. That is the part of full-stack engineering I care about most: using technical depth to make complex workflows feel intuitive for the people using the product.`,
        360,
      )),
      sanitizeApplicationCopy(clipText(
        `I would be glad to walk through the design tradeoffs behind ${walkthrough} and how I think about real-time product quality, extensibility, and user experience.`,
        240,
      )),
    ];
  }

  const focusThemes = roleSignals.focusThemes.length
    ? sentenceJoin(roleSignals.focusThemes.slice(0, 3))
    : 'reliable software infrastructure around machine-learning systems';
  const technicalAngles = [
    roleSignals.flags.data ? 'data-intensive Python workflows' : '',
    roleSignals.flags.training ? 'PyTorch-based experimentation' : '',
    roleSignals.flags.inference || roleSignals.flags.systems ? 'low-latency systems built in C++ and Linux' : '',
    roleSignals.flags.cloud ? 'workflow orchestration in production environments' : '',
  ].filter(Boolean).slice(0, 3);
  const evidence = collectDocumentEvidence(workEntries, projectEntries, roleSignals);
  const leadingEvidence = evidence.slice(0, 2).map((item) => {
    const summary = lowerFirst(item.summary).replace(/[.]+$/, '');
    if (item.type === 'work') {
      return `At ${item.label}, I ${summary}`;
    }
    return `In ${item.label}, I ${summary}`;
  });
  const domain = roleSignals.metadata.domain || row.company;
  const walkthrough = evidence[0]?.label || projectEntries[0]?.title || workEntries[0]?.company || row.role;

  return [
    sanitizeApplicationCopy(clipText(
      `I am applying for the ${row.role} role at ${row.company}. My work centers on ${focusThemes}, with recent projects spanning ${sentenceJoin(technicalAngles) || 'production-grade software systems and machine-learning workflows'}.`,
      340,
    )),
    sanitizeApplicationCopy(clipText(
      leadingEvidence.length
        ? `${leadingEvidence.join('. ')}.`
        : `I have built project work that combines measurable system performance, model-oriented experimentation, and production-style workflow reliability.`,
      360,
    )),
    sanitizeApplicationCopy(clipText(
      `That mix is why ${row.company} stands out to me. ${domain} work depends on engineers who can move between pipeline reliability, model evaluation, and service performance without treating them as separate problems.`,
      360,
    )),
    sanitizeApplicationCopy(clipText(
      `I would be glad to walk through the design and tradeoffs behind ${walkthrough} if that would be useful for your team.`,
      240,
    )),
  ];
}

async function buildCvHtml(row, cvMarkdown, reportContent, profile) {
  const template = await readText('templates/cv-template.html');
  const contact = parseCvContact(cvMarkdown);
  const candidate = profile.candidate || {};
  const portfolio = candidate.portfolio_url || contact.github || candidate.github || '';
  const linkedin = candidate.linkedin || '';
  const roleSignals = buildRoleSignals(row, reportContent, cvMarkdown);
  const keySkills = extractKeySkills(reportContent, cvMarkdown, roleSignals);
  const workEntries = tailorWorkEntries(parseWorkEntries(cvMarkdown), roleSignals);
  const projects = tailorProjectEntries(parseProjectEntries(cvMarkdown), roleSignals);
  const skillEntries = buildTailoredSkillEntries(cvMarkdown, roleSignals);
  const location = candidate.location || profile.location?.city || '';

  return replaceTemplate(template, {
    LANG: 'en',
    PAGE_WIDTH: '8.5in',
    NAME: escapeHtml(candidate.full_name || contact.name),
    CONTACT_ROW: buildCvContactRow(contact, candidate, escapeHtml(location), portfolio, linkedin),
    SECTION_COMPETENCIES: 'Technical Skills',
    COMPETENCIES: keySkills
      .map((skill) => `<span class="competency-tag">${escapeHtml(skill)}</span>`)
      .join('\n'),
    SECTION_EXPERIENCE: 'Work Experience',
    EXPERIENCE: renderExperience(workEntries),
    SECTION_PROJECTS: 'Projects',
    PROJECTS: renderProjects(projects),
    SECTION_EDUCATION: 'Education',
    EDUCATION: renderEducation(parseEducationEntries(cvMarkdown)),
    CERTIFICATIONS_SECTION: renderCertifications([]),
    SKILLS: renderSkills(skillEntries, roleSignals),
  });
}

function buildCoverLetterContent(row, cvMarkdown, reportContent, profile) {
  const contact = parseCvContact(cvMarkdown);
  const candidate = profile.candidate || {};
  const linkedin = candidate.linkedin || '';
  const date = dateStamp();
  const roleSignals = buildRoleSignals(row, reportContent, cvMarkdown);
  const workEntries = tailorWorkEntries(parseWorkEntries(cvMarkdown), roleSignals);
  const projectEntries = tailorProjectEntries(parseProjectEntries(cvMarkdown), roleSignals);

  return {
    lang: 'en',
    page_width: '8.5in',
    format: 'letter',
    candidate: {
      name: candidate.full_name || contact.name,
      email: candidate.email || contact.email,
      linkedin_url: normalizeUrl(linkedin || contact.github),
      linkedin_display: displayUrl(linkedin || contact.github),
      location: candidate.location || profile.location?.city || '',
    },
    letter: {
      company: row.company,
      role: row.role,
      date,
      salutation: `Dear ${row.company} hiring team,`,
      closing: 'Best,',
      paragraphs: buildCoverLetterParagraphs(row, roleSignals, workEntries, projectEntries),
    },
  };
}

function runNodeScript(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(output || `${args[0]} failed with status ${result.status}`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

export async function generateDocument(input) {
  const type = input.type;
  if (type !== 'cv' && type !== 'cover-letter') {
    throw new ClientError('type must be cv or cover-letter');
  }
  const row = {
    company: stripMarkdown(input.company),
    role: stripMarkdown(input.role),
    score: stripMarkdown(input.score),
    notes: stripMarkdown(input.notes),
    jobUrl: stripMarkdown(input.jobUrl),
    reportPath: input.reportPath,
  };
  if (!row.company || !row.role) {
    throw new ClientError('company and role are required');
  }

  const reportAbs = resolveReportPath(row.reportPath);
  const reportContent = reportAbs ? await readFile(reportAbs, 'utf8') : '';
  const cvMarkdown = await readText('cv.md');
  if (!cvMarkdown.trim()) {
    throw new ClientError('cv.md is required for PDF generation', 422);
  }

  const profile = await loadProfile();
  await mkdir(WORK_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const filename = `${type}-${slugify(row.company, 'company')}-${slugify(row.role, 'role')}-${dateStamp()}.pdf`;
  const outputPath = join(OUTPUT_DIR, filename);
  const docId = createHash('sha256')
    .update(`${type}:${row.company}:${row.role}:${row.reportPath || ''}:${Date.now()}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 20);

  if (type === 'cv') {
    const html = await buildCvHtml(row, cvMarkdown, reportContent, profile);
    const htmlPath = join(WORK_DIR, `${docId}.html`);
    await writeFile(htmlPath, html);
    runNodeScript(['generate-pdf.mjs', htmlPath, outputPath, '--format=letter']);
  } else {
    const content = buildCoverLetterContent(row, cvMarkdown, reportContent, profile);
    const jsonPath = join(WORK_DIR, `${docId}.json`);
    await writeFile(jsonPath, JSON.stringify(content, null, 2));
    runNodeScript(['generate-cover-letter.mjs', jsonPath, outputPath, '--format=letter']);
  }

  await stat(outputPath);
  const doc = { id: docId, type, filename, outputPath };
  docStore.set(docId, doc);
  return doc;
}

async function uniqueDownloadPath(filename) {
  await mkdir(DOWNLOADS_DIR, { recursive: true });
  const ext = extname(filename);
  const base = basename(filename, ext);
  let candidate = join(DOWNLOADS_DIR, filename);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(DOWNLOADS_DIR, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

export async function copyToDownloads(docId) {
  const doc = docStore.get(docId);
  if (!doc) {
    throw new ClientError('document id not found or expired', 404);
  }
  await stat(doc.outputPath);
  const savedPath = await uniqueDownloadPath(doc.filename);
  await copyFile(doc.outputPath, savedPath);
  return { ...doc, savedPath };
}

function updateApplicationsMarkdownStatus(markdown, rowNum, applied) {
  const normalizedNum = String(rowNum ?? '').trim();
  if (!/^\d+$/.test(normalizedNum)) {
    throw new ClientError('num is required');
  }
  if (typeof applied !== 'boolean') {
    throw new ClientError('applied must be boolean');
  }

  let found = false;
  let changed = false;
  let status = null;
  const lines = markdown.split('\n').map((line) => {
    if (!line.startsWith('|') || line.includes('---') || /\|\s*#\s*\|/.test(line)) {
      return line;
    }
    const cells = line.split('|');
    if (cells.length < 11 || cells[1].trim() !== normalizedNum) {
      return line;
    }

    found = true;
    const currentStatus = cells[6].trim();
    status = applied
      ? (TERMINAL_APPLICATION_STATUSES.has(currentStatus) ? currentStatus : 'Applied')
      : (currentStatus === 'Applied' ? 'Evaluated' : currentStatus);

    if (currentStatus === status) {
      return line;
    }

    cells[6] = ` ${status} `;
    changed = true;
    return cells.join('|');
  });

  if (!found) {
    throw new ClientError(`application row ${normalizedNum} was not found`, 404);
  }

  return {
    markdown: lines.join('\n'),
    status,
    changed,
  };
}

export async function setApplicationStatusForFile(applicationsPath, body) {
  const result = updateApplicationsMarkdownStatus(
    await readFile(applicationsPath, 'utf8'),
    body.num,
    body.applied
  );
  if (result.changed) {
    await writeFile(applicationsPath, result.markdown, 'utf8');
  }
  return result;
}

export async function setApplicationStatus(body) {
  return setApplicationStatusForFile(APPLICATIONS_PATH, body);
}

async function readBridgeToken() {
  if (!existsSync(BRIDGE_TOKEN_PATH)) {
    throw new ClientError('bridge token not found; start with npm run server', 503);
  }
  return (await readFile(BRIDGE_TOKEN_PATH, 'utf8')).trim();
}

function bridgeEnvelope(payload) {
  return {
    protocol: '1.0.0',
    requestId: `dashboard-${randomUUID()}`,
    clientTimestamp: new Date().toISOString(),
    payload,
  };
}

async function postBridge(path, payload) {
  const token = await readBridgeToken();
  let response;
  try {
    response = await fetch(`${BRIDGE_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-auto-job-token': token,
      },
      body: JSON.stringify(bridgeEnvelope(payload)),
    });
  } catch (error) {
    throw new ClientError(`bridge request failed; start npm run server. ${error.message}`, 503);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new ClientError(body.error?.message || `bridge returned ${response.status}`, response.status || 502);
  }
  return body.result;
}

async function getBridge(path) {
  const token = await readBridgeToken();
  let response;
  try {
    response = await fetch(`${BRIDGE_BASE}${path}`, {
      headers: { 'x-auto-job-token': token },
    });
  } catch (error) {
    throw new ClientError(`bridge request failed; start npm run server. ${error.message}`, 503);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new ClientError(body.error?.message || `bridge returned ${response.status}`, response.status || 502);
  }
  return body.result;
}

function extractReportUrl(reportContent) {
  const match = reportContent.match(/^\*\*URL:\*\*\s*(\S+)/mi);
  return match?.[1]?.trim() || '';
}

function parsePipelineLocalJdPath(markdown, url) {
  if (!url) return null;
  const normalized = normalizeUrl(url);
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.includes('[local:')) continue;
    const lineUrl = line.match(/https?:\/\/\S+/)?.[0] || '';
    if (normalizeUrl(lineUrl) !== normalized) continue;
    const local = line.match(/\[local:([^\]]+)\]/)?.[1]?.trim();
    return local || null;
  }
  return null;
}

async function readCachedJdForUrl(url) {
  const pipeline = await readText('data/pipeline.md', '');
  const localPath = parsePipelineLocalJdPath(pipeline, url);
  if (!localPath || !/^jds\/[^/]+\.txt$/.test(localPath)) return '';
  return readText(localPath, '');
}

function buildFullEvaluationPageText({ row, url, reportContent, jdContent }) {
  return [
    'Dashboard full evaluation requested after manual_review quick-screen decision.',
    `Tracker row: ${row.company} — ${row.role}`,
    `Tracker score: ${row.score || 'unknown'}`,
    `Tracker status: ${row.status || 'unknown'}`,
    row.notes ? `Tracker notes: ${row.notes}` : null,
    jdContent ? `Cached JD:\n${jdContent}` : null,
    reportContent ? `Prior quick-screen report:\n${reportContent}` : null,
    `URL: ${url}`,
  ].filter(Boolean).join('\n\n').slice(0, 50_000);
}

async function queueFullEvaluation(body, opts = {}) {
  if (!body.reportPath) throw new ClientError('reportPath is required');
  if (!body.company || !body.role) throw new ClientError('company and role are required');
  const reportAbs = resolveReportPath(String(body.reportPath));
  const reportContent = await readFile(reportAbs, 'utf8');
  const url = extractReportUrl(reportContent) || normalizeUrl(body.jobUrl || '');
  if (!url) throw new ClientError('job URL is required');
  const jdContent = await readCachedJdForUrl(url);
  const input = {
    url,
    title: String(body.role),
    structuredSignals: {
      source: 'dashboard',
      company: String(body.company),
      role: String(body.role),
    },
    detection: {
      label: 'job_posting',
      confidence: 1,
      signals: ['dashboard_full_evaluation', 'manual_rerun'],
    },
    pageText: buildFullEvaluationPageText({
      row: body,
      url,
      reportContent,
      jdContent,
    }),
  };
  const post = opts.postBridge || postBridge;
  const bridgeBase = opts.bridgeBase || BRIDGE_BASE;
  const created = await post('/v1/evaluate', { input });
  return {
    jobId: created.jobId,
    bridgeBase,
  };
}

export async function readFullEvaluationStatus(body, opts = {}) {
  if (!body.jobId) throw new ClientError('jobId is required');
  const get = opts.getBridge || getBridge;
  const snapshot = await get(`/v1/jobs/${encodeURIComponent(String(body.jobId))}`);
  return {
    jobId: snapshot.id,
    phase: snapshot.phase,
    updatedAt: snapshot.updatedAt,
    error: snapshot.error?.message || null,
    result: snapshot.result ? {
      reportPath: snapshot.result.reportPath || null,
      pdfPath: snapshot.result.pdfPath || null,
      trackerMerged: snapshot.result.trackerMerged ?? null,
      score: snapshot.result.summary?.score ?? null,
      recommendation: snapshot.result.summary?.recommendation ?? null,
    } : null,
  };
}

export {
  buildRoleSignals,
  buildCvHtml,
  buildCoverLetterContent,
  loadProfile,
  readText,
  queueFullEvaluation,
  updateApplicationsMarkdownStatus,
};

export { getScanCatalog, runnerEnv } from './scan-runner.mjs';
import { buildArgv as _buildArgv, runnerEnv as _runnerEnv } from './scan-runner.mjs';

export function spawnScan(req, hooks) {
  const argv = _buildArgv(req);
  const env = { ...process.env, ..._runnerEnv(req.runner) };
  const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, env });
  const onLine = (type) => (chunk) => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (line) hooks.onLog(type, line);
    }
  };
  child.stdout.on('data', onLine('stdout'));
  child.stderr.on('data', onLine('stderr'));
  child.on('exit', (code) => hooks.onExit(code ?? 0));
  child.on('error', (err) => { hooks.onLog('stderr', String(err)); hooks.onExit(1); });
  return { kill: () => child.kill('SIGTERM') };
}
