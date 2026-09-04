import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminOnly } from '../src/services/admin-token-auth';
import { requireOpsToken } from '../src/services/ops-token-auth';

type ResponseStub = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

const responseStub = (): ResponseStub => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as ResponseStub;
  response.status.mockReturnValue(response);
  return response;
};

const requestStub = (headers: Record<string, string> = {}) => ({
  headers,
  get: (name: string) => headers[name.toLowerCase()] || undefined,
});

describe('HTTP authentication middleware', () => {
  const originalAdminToken = process.env.ADMIN_SECRET_TOKEN;
  const originalOpsToken = process.env.OPS_API_TOKEN;

  beforeEach(() => {
    delete process.env.ADMIN_SECRET_TOKEN;
    delete process.env.OPS_API_TOKEN;
  });

  afterEach(() => {
    if (originalAdminToken === undefined) delete process.env.ADMIN_SECRET_TOKEN;
    else process.env.ADMIN_SECRET_TOKEN = originalAdminToken;
    if (originalOpsToken === undefined) delete process.env.OPS_API_TOKEN;
    else process.env.OPS_API_TOKEN = originalOpsToken;
  });

  it('fails closed when the admin token is missing or too short', () => {
    const response = responseStub();
    adminOnly(requestStub(), response as never, vi.fn());

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('accepts only the configured admin bearer token', () => {
    process.env.ADMIN_SECRET_TOKEN = 'admin-token-that-is-long';
    const next = vi.fn();
    const response = responseStub();

    adminOnly(requestStub({ authorization: 'Bearer admin-token-that-is-long' }), response as never, next);
    expect(next).toHaveBeenCalledOnce();

    const rejectedResponse = responseStub();
    adminOnly(requestStub({ authorization: 'Bearer wrong-token-that-is-long' }), rejectedResponse as never, vi.fn());
    expect(rejectedResponse.status).toHaveBeenCalledWith(401);
  });

  it('fails closed and accepts the configured ops token through either supported header', () => {
    process.env.OPS_API_TOKEN = 'ops-token-that-is-long';
    const missingResponse = responseStub();
    requireOpsToken(requestStub(), missingResponse as never, vi.fn());
    expect(missingResponse.status).toHaveBeenCalledWith(401);

    const next = vi.fn();
    requireOpsToken(requestStub({ 'x-ops-token': 'ops-token-that-is-long' }), responseStub() as never, next);
    expect(next).toHaveBeenCalledOnce();

    const bearerNext = vi.fn();
    requireOpsToken(requestStub({ authorization: 'Bearer ops-token-that-is-long' }), responseStub() as never, bearerNext);
    expect(bearerNext).toHaveBeenCalledOnce();
  });
});