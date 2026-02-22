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

/**
 * 为 DeepSeek 设置自定义 baseUrl
 */
function applyDeepSeekBaseUrl(model: any): any {
  // 如果使用 openai provider 且模型是 deepseek-chat，设置 DeepSeek API 的 baseUrl
  if (model?.id === 'deepseek-chat' || model?.id?.startsWith('deepseek-')) {
    const customBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
    // 创建一个新的模型对象，覆盖 baseUrl
    return { ...model, baseUrl: customBaseUrl };
  }
  return model;
}

export function getConfiguredModel(): { model: ReturnType<typeof getModel>; config: ModelConfig } {
  const provider = process.env.LLM_PROVIDER || 'openai';
  const modelName = process.env.LLM_MODEL || 'deepseek-chat';

  // 获取模型并应用 DeepSeek baseUrl
  let model = getModel(provider, modelName);
  model = applyDeepSeekBaseUrl(model);

  return {
    model,
    config: { provider, model: modelName }
  };
}

export function getModelCandidates(): ModelConfig[] {
  const envCandidates = parseCandidates(process.env.LLM_CANDIDATES);
  if (envCandidates.length > 0) return envCandidates;

  return [
    { provider: 'openai', model: 'deepseek-chat' },
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
  const primary = getConfiguredModel();
  const candidates = [primary.config, ...getModelCandidates().filter(item =>
    !(item.provider === primary.config.provider && item.model === primary.config.model)
  )];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      let model = getModel(candidate.provider, candidate.model);
      model = applyDeepSeekBaseUrl(model);
      const response = await complete(model, context);
      return { response, config: candidate };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No available model candidate succeeded.');
}
