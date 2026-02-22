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

export function getConfiguredModel(): ModelConfig {
  return {
    provider: process.env.LLM_PROVIDER || 'openai',
    model: process.env.LLM_MODEL || 'deepseek-chat'
  };
}

/**
 * 获取 pi-ai 模型对象（用于 Agent 等需要实际模型对象的场景）
 */
export function getPiAiModel() {
  const config = getConfiguredModel();

  // DeepSeek 需要特殊处理，因为 pi-ai 不直接支持
  if (config.provider === 'openai' && config.model === 'deepseek-chat') {
    // DeepSeek 通过 completeWithFallback 直接调用，这里返回 null
    // Agent 模式会使用备用模型
    const candidates = getModelCandidates().filter(
      c => !(c.provider === config.provider && c.model === config.model)
    );
    const fallback = candidates[0];
    if (fallback) {
      return getModel(fallback.provider, fallback.model);
    }
  }

  return getModel(config.provider, config.model);
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
  const candidates = [primary, ...getModelCandidates().filter(item =>
    !(item.provider === primary.provider && item.model === primary.model)
  )];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      // DeepSeek 使用自定义 API
      if (candidate.provider === 'openai' && candidate.model === 'deepseek-chat') {
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
        const apiKey = process.env.OPENAI_API_KEY;

        const apiResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: context.messages.map((m: any) => ({
              role: m.role,
              content: m.content
            })),
            stream: false
          })
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          throw new Error(`DeepSeek API error: ${apiResponse.status} ${errorText}`);
        }

        const data = await apiResponse.json();
        const response = {
          content: [{
            type: 'text',
            text: data.choices[0]?.message?.content || ''
          }],
          usage: data.usage
        };
        return { response, config: candidate };
      }

      // 其他模型使用 pi-ai 的 complete
      const model = getModel(candidate.provider, candidate.model);
      const response = await complete(model, context);
      return { response, config: candidate };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No available model candidate succeeded.');
}
