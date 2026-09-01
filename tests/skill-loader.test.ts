import { describe, expect, it } from 'vitest';
import { matchSkill, parseSkillFile, renderSkillReply, type SkillDefinition } from '../src/services/skill-loader';

describe('parseSkillFile', () => {
  it('parses a well-formed skill file with both languages', () => {
    const content = [
      '---',
      'command: HOURS',
      'aliases: OPENING HOURS, เวลาเปิด',
      'adminOnly: false',
      '---',
      '',
      '# th',
      'เปิดทุกวัน',
      '',
      '# en',
      'Open every day',
      '',
    ].join('\n');

    expect(parseSkillFile('hours.md', content)).toEqual({
      file: 'hours.md',
      command: 'HOURS',
      aliases: ['OPENING HOURS', 'เวลาเปิด'],
      adminOnly: false,
      th: 'เปิดทุกวัน',
      en: 'Open every day',
      hasArg: false,
    });
  });

  it('detects {query} in either language body as hasArg', () => {
    const content = ['---', 'command: TRACK', '---', '', '# th', 'ลิงก์: {query}', '', '# en', 'Link: {query}'].join('\n');
    expect(parseSkillFile('track.md', content)?.hasArg).toBe(true);
  });

  it('defaults adminOnly to false and aliases to empty when omitted', () => {
    const content = ['---', 'command: CONTACT', '---', '', '# en', 'Email us'].join('\n');
    const parsed = parseSkillFile('contact.md', content);
    expect(parsed?.adminOnly).toBe(false);
    expect(parsed?.aliases).toEqual([]);
  });

  it('returns null when there is no frontmatter block', () => {
    expect(parseSkillFile('bad.md', 'just some text, no frontmatter')).toBeNull();
  });

  it('returns null when command is missing', () => {
    const content = ['---', 'adminOnly: true', '---', '', '# en', 'hello'].join('\n');
    expect(parseSkillFile('bad.md', content)).toBeNull();
  });

  it('returns null when neither language body is present', () => {
    const content = ['---', 'command: EMPTY', '---', ''].join('\n');
    expect(parseSkillFile('bad.md', content)).toBeNull();
  });
});

describe('matchSkill', () => {
  const noArgSkill: SkillDefinition = {
    file: 'hours.md', command: 'HOURS', aliases: ['OPENING HOURS'], adminOnly: false, th: 'x', en: 'y', hasArg: false,
  };
  const argSkill: SkillDefinition = {
    file: 'track.md', command: 'TRACK', aliases: [], adminOnly: false, th: '{query}', en: '{query}', hasArg: true,
  };

  it('matches an exact no-arg command', () => {
    expect(matchSkill([noArgSkill], 'HOURS', 'HOURS')).toEqual({ skill: noArgSkill, query: '' });
  });

  it('matches an alias', () => {
    expect(matchSkill([noArgSkill], 'OPENING HOURS', 'OPENING HOURS')).toEqual({ skill: noArgSkill, query: '' });
  });

  it('does not prefix-match a no-arg skill', () => {
    expect(matchSkill([noArgSkill], 'HOURS TODAY', 'HOURS TODAY')).toBeNull();
  });

  it('prefix-matches an arg skill and extracts the query from the raw (non-uppercased) text', () => {
    expect(matchSkill([argSkill], 'TRACK Abc123', 'TRACK Abc123')).toEqual({ skill: argSkill, query: 'Abc123' });
  });

  it('matches an arg skill with no query as empty string', () => {
    expect(matchSkill([argSkill], 'TRACK', 'TRACK')).toEqual({ skill: argSkill, query: '' });
  });

  it('returns null when nothing matches', () => {
    expect(matchSkill([noArgSkill, argSkill], 'UNKNOWN COMMAND', 'UNKNOWN COMMAND')).toBeNull();
  });
});

describe('renderSkillReply', () => {
  it('substitutes {query} in the requested language', () => {
    const skill: SkillDefinition = {
      file: 'track.md', command: 'TRACK', aliases: [], adminOnly: false,
      th: 'ลิงก์: {query}', en: 'Link: {query}', hasArg: true,
    };
    expect(renderSkillReply(skill, 'en', 'Abc123')).toBe('Link: Abc123');
    expect(renderSkillReply(skill, 'th', 'Abc123')).toBe('ลิงก์: Abc123');
  });

  it('falls back to the other language when the requested one is empty', () => {
    const skill: SkillDefinition = {
      file: 'contact.md', command: 'CONTACT', aliases: [], adminOnly: false, th: '', en: 'Email us', hasArg: false,
    };
    expect(renderSkillReply(skill, 'th', '')).toBe('Email us');
  });
});
