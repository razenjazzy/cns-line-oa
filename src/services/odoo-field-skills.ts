import fs from 'fs';
import path from 'path';
import { resolveSkillsDir } from './skill-loader';

export type OdooFieldWidget = 'text' | 'list' | 'date' | 'toggle';
export type OdooFieldLoader = 'products' | 'services' | 'paymentTerms';

export type OdooFieldSkill = {
  file: string;
  model: string;
  field: string;
  widget: OdooFieldWidget;
  flow: string;
  flowField: string;
  loader?: OdooFieldLoader;
};

const WIDGETS = new Set<OdooFieldWidget>(['text', 'list', 'date', 'toggle']);
const LOADERS = new Set<OdooFieldLoader>(['products', 'services', 'paymentTerms']);

const parseFrontmatter = (raw: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return fields;
};

export const parseOdooFieldSkill = (fileName: string, content: string): OdooFieldSkill | null => {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;
  const fields = parseFrontmatter(frontmatterMatch[1]);
  const model = fields.model?.trim();
  const field = fields.field?.trim();
  const widget = fields.widget?.trim() as OdooFieldWidget;
  const flow = fields.flow?.trim();
  const flowField = fields.flowfield?.trim();
  if (!model || !field || !flow || !flowField || !WIDGETS.has(widget)) return null;
  const loader = fields.loader?.trim() as OdooFieldLoader | undefined;
  if (loader && !LOADERS.has(loader)) return null;
  return { file: fileName, model, field, widget, flow, flowField, loader };
};

export const resolveOdooFieldsDir = (): string => path.join(resolveSkillsDir(), 'odoo-fields');

let cached: OdooFieldSkill[] | null = null;

/** Allowlisted Odoo field → LINE widget map. Never calls fields_get. */
export const loadOdooFieldSkills = (): OdooFieldSkill[] => {
  if (cached) return cached;
  const dir = resolveOdooFieldsDir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'readme.md');
  } catch {
    cached = [];
    return cached;
  }

  const skills: OdooFieldSkill[] = [];
  for (const entry of entries) {
    try {
      const parsed = parseOdooFieldSkill(entry, fs.readFileSync(path.join(dir, entry), 'utf8'));
      if (parsed) skills.push(parsed);
      else console.warn(`Skipping malformed odoo-field skill: ${entry}`);
    } catch (error) {
      console.warn(`Failed to read odoo-field skill ${entry}:`, error);
    }
  }
  cached = skills;
  return cached;
};

export const resetOdooFieldSkillsCache = (): void => {
  cached = null;
};
