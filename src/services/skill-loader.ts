import fs from 'fs';
import path from 'path';

/**
 * Markdown-based skill loader for the LINE bot's command router.
 *
 * Lets a non-developer add or edit simple reply commands (FAQ answers,
 * static info, link-outs with an argument) by dropping a .md file into
 * skills/ — no TypeScript, no rebuild logic beyond a process restart to
 * pick up new/changed files. This is an original feature for this
 * project; it takes inspiration from clawframework's markdown-skill
 * pattern (nano_claude.py) but shares no code or runtime dependency
 * with it — see clawframework/README.MD for why that boundary matters.
 *
 * File format:
 *   ---
 *   command: HOURS
 *   aliases: OPENING HOURS, เวลาเปิด
 *   adminOnly: false
 *   ---
 *
 *   # th
 *   ร้านเปิดทุกวันจันทร์-เสาร์ 09:00-18:00 น. ค่ะ
 *
 *   # en
 *   We're open Monday-Saturday, 09:00-18:00.
 *
 * `{query}` inside either language body is replaced with whatever text the
 * user typed after the matched command word. A skill that uses `{query}`
 * matches as a prefix (`HOURS ...`); a skill that doesn't matches only the
 * exact command/alias, so it can never accidentally swallow an unrelated
 * longer message.
 *
 * Skills are always evaluated last in the command-handler registry (see
 * src/line/handlers/skills.ts / handlers/index.ts) — a skill can never
 * shadow a built-in TypeScript command, only fill a gap.
 */

export type SkillDefinition = {
  /** Source filename, for logging/debugging. */
  file: string;
  /** Primary trigger, already uppercased/trimmed. */
  command: string;
  /** Additional trigger phrases, already uppercased/trimmed. */
  aliases: string[];
  adminOnly: boolean;
  th: string;
  en: string;
  /** True if either body uses {query} — enables prefix matching. */
  hasArg: boolean;
};

const normalizeKey = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, ' ');

const parseFrontmatter = (raw: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return fields;
};

const extractSection = (body: string, headerPattern: RegExp): string => {
  const lines = body.split('\n');
  const startIndex = lines.findIndex(line => headerPattern.test(line.trim()));
  if (startIndex === -1) return '';

  const collected: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^#\s*(th|en)\s*$/i.test(lines[i].trim())) break;
    collected.push(lines[i]);
  }
  return collected.join('\n').trim();
};

/**
 * Parses one skill file's raw text. Returns null (and never throws) for a
 * malformed file so one bad file can't take the whole loader down — the
 * caller logs a warning naming the file instead.
 */
export const parseSkillFile = (fileName: string, content: string): SkillDefinition | null => {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const fields = parseFrontmatter(frontmatterMatch[1]);
  const body = frontmatterMatch[2] || '';

  const command = normalizeKey(fields.command || '');
  if (!command) return null;

  const aliases = (fields.aliases || '')
    .split(',')
    .map(normalizeKey)
    .filter(Boolean);

  const adminOnly = /^(1|true|yes|on)$/i.test(fields.adminonly || '');

  const th = extractSection(body, /^#\s*th\s*$/i);
  const en = extractSection(body, /^#\s*en\s*$/i);
  if (!th && !en) return null;

  const hasArg = th.includes('{query}') || en.includes('{query}');

  return { file: fileName, command, aliases, adminOnly, th, en, hasArg };
};

export const resolveSkillsDir = (): string => {
  const override = process.env.SKILLS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.resolve(__dirname, '../../skills');
};

let cachedSkills: SkillDefinition[] | null = null;

/**
 * Loads and caches every valid skill file in the skills directory.
 * Returns an empty array (never throws) if the directory is missing —
 * skills are entirely optional. Cached for the process lifetime; a code
 * deploy or process restart is required to pick up file changes, same as
 * any other config baked into the deploy.
 */
export const loadSkills = (): SkillDefinition[] => {
  if (cachedSkills) return cachedSkills;

  const dir = resolveSkillsDir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'readme.md');
  } catch {
    cachedSkills = [];
    return cachedSkills;
  }

  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    try {
      const content = fs.readFileSync(path.join(dir, entry), 'utf8');
      const parsed = parseSkillFile(entry, content);
      if (parsed) {
        skills.push(parsed);
      } else {
        console.warn(`Skipping malformed skill file: ${entry}`);
      }
    } catch (error) {
      console.warn(`Failed to read skill file ${entry}:`, error);
    }
  }

  cachedSkills = skills;
  return cachedSkills;
};

export type SkillMatch = { skill: SkillDefinition; query: string };

/**
 * rawText must be the same string upperText was derived from (same length/
 * offsets) — the query slice is taken from rawText so a product name, code,
 * or other case-sensitive argument isn't mangled by the uppercase match.
 */
export const matchSkill = (skills: SkillDefinition[], upperText: string, rawText: string): SkillMatch | null => {
  for (const skill of skills) {
    const keys = [skill.command, ...skill.aliases];
    for (const key of keys) {
      if (skill.hasArg) {
        if (upperText === key) return { skill, query: '' };
        if (upperText.startsWith(`${key} `)) return { skill, query: rawText.slice(key.length + 1).trim() };
      } else if (upperText === key) {
        return { skill, query: '' };
      }
    }
  }
  return null;
};

export const renderSkillReply = (skill: SkillDefinition, language: 'th' | 'en', query: string): string => {
  const template = language === 'th' ? (skill.th || skill.en) : (skill.en || skill.th);
  return template.replace(/\{query\}/g, query);
};
