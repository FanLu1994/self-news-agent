import { complete, getModel } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';

export interface ModelConfig {
  provider: string;
  model: string;
}

function parseCandidates(raw: string | undefined): ModelConfig[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [provider, ...rest] = item.split(':');
      return {
        provider: provider?.trim() || '',
        model: rest.join(':').trim()
      };
    })
    .filter(item => item.provider && item.model);
}

export function getConfiguredModel(): { model: ReturnType<typeof getModel>; config: ModelConfig } {
  const provider = process.env.LLM_PROVIDER || 'zai';
  const modelName = process.env.LLM_MODEL || 'glm-4.7';
  return {
    model: getModel(provider, modelName),
    config: { provider, model: modelName }
  };
}

export function getModelCandidates(): ModelConfig[] {
  const envCandidates = parseCandidates(process.env.LLM_CANDIDATES);
  if (envCandidates.length > 0) return envCandidates;

  return [
    { provider: 'zai', model: 'glm-4.7' },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { provider: 'google', model: 'gemini-2.5-flash' }
  ];
}

export async function completeWithFallback(context: Context): Promise<{
  response: Awaited<ReturnType<typeof complete>>;
  config: ModelConfig;
}> {
  const primary = getConfiguredModel().config;
  const candidates = [primary, ...getModelCandidates().filter(item =>
    !(item.provider === primary.provider && item.model === primary.model)
  )];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const response = await complete(getModel(candidate.provider, candidate.model), context);
      return { response, config: candidate };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No available model candidate succeeded.');
}
