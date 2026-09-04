import { afterEach, describe, expect, it } from 'vitest';
import { getOdooConfig, isTransientOdooError } from '../src/services/odoo/client';

describe('Odoo client configuration', () => {
  const original = {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    apiKey: process.env.ODOO_API_KEY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      ODOO_URL: original.url,
      ODOO_DB: original.db,
      ODOO_USERNAME: original.username,
      ODOO_API_KEY: original.apiKey,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('fails closed when required configuration is incomplete', () => {
    delete process.env.ODOO_URL;
    delete process.env.ODOO_DB;
    delete process.env.ODOO_USERNAME;
    delete process.env.ODOO_API_KEY;
    expect(getOdooConfig()).toBeNull();
  });

  it('trims complete configuration', () => {
    process.env.ODOO_URL = ' https://odoo.example ';
    process.env.ODOO_DB = ' db ';
    process.env.ODOO_USERNAME = ' user ';
    process.env.ODOO_API_KEY = ' key ';
    expect(getOdooConfig()).toEqual({ url: 'https://odoo.example', db: 'db', username: 'user', apiKey: 'key' });
  });

  it('classifies transient network and server errors', () => {
    expect(isTransientOdooError(new Error('fetch failed'))).toBe(true);
    expect(isTransientOdooError(new Error('Odoo HTTP 503'))).toBe(true);
    expect(isTransientOdooError(new Error('Odoo HTTP 400'))).toBe(false);
  });
});