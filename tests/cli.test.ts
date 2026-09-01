import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli/index';

describe('cli parseArgs', () => {
  it('parses a bare command with no args', () => {
    expect(parseArgs(['health'])).toEqual({ command: 'health', positional: [], flags: {} });
  });

  it('defaults to help when no command is given', () => {
    expect(parseArgs([])).toEqual({ command: 'help', positional: [], flags: {} });
  });

  it('collects positional args before a flag', () => {
    expect(parseArgs(['chat', 'hello', 'world', '--user', 'U123'])).toEqual({
      command: 'chat',
      positional: ['hello', 'world'],
      flags: { user: 'U123' },
    });
  });

  it('treats a flag with no following value as boolean true', () => {
    expect(parseArgs(['jobs:daily-report', '--yes'])).toEqual({
      command: 'jobs:daily-report',
      positional: [],
      flags: { yes: true },
    });
  });

  it('treats a flag immediately followed by another flag as boolean true', () => {
    expect(parseArgs(['rotate-session', '--yes', '--secret', 'x'.repeat(20)])).toEqual({
      command: 'rotate-session',
      positional: [],
      flags: { yes: true, secret: 'x'.repeat(20) },
    });
  });
});
