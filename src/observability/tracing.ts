import { SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { appLogger } from '../services/logger';

const isEnabled = (): boolean => /^(1|true|yes|on)$/i.test(process.env.OTEL_ENABLED || '');

const tracer = trace.getTracer('cns-line-oa');

let provider: NodeTracerProvider | null = null;

export const initTracing = (): void => {
  if (!isEnabled() || provider) return;

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined,
  });

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'cns-line-oa',
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  appLogger.info('otel_enabled', { exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'default' });
};

export const shutdownTracing = async (): Promise<void> => {
  if (!provider) return;
  await provider.shutdown();
  provider = null;
};

export const withSpan = async <T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>,
): Promise<T> => {
  if (!isEnabled()) return fn();

  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined) span.setAttribute(key, value);
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
};
