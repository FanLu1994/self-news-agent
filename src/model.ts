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

  console.log(`\n🔧 LLM 配置:`);
  console.log(`  主模型: ${primary.provider}:${primary.model}`);
  console.log(`  备用模型: ${candidates.slice(1).map(c => `${c.provider}:${c.model}`).join(', ')}`);

  let lastError: unknown;
  for (const [index, candidate] of candidates.entries()) {
    try {
      console.log(`\n  📡 尝试模型 ${index + 1}/${candidates.length}: ${candidate.provider}:${candidate.model}`);

      let response: any;

      // DeepSeek 使用自定义 API
      if (candidate.provider === 'openai' && candidate.model === 'deepseek-chat') {
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
        const apiKey = process.env.OPENAI_API_KEY;
        console.log(`    使用 DeepSeek API: ${baseUrl}`);

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
        response = {
          content: [{
            type: 'text',
            text: data.choices[0]?.message?.content || ''
          }],
          usage: data.usage
        };
      } else {
        // 其他模型使用 pi-ai 的 complete
        let model = getModel(candidate.provider, candidate.model);
        model = applyDeepSeekBaseUrl(model);

        console.log(`    模型 ID: ${model?.id || 'N/A'}`);
        console.log(`    模型 baseUrl: ${model?.baseUrl || 'N/A'}`);

        response = await complete(model, context);
      }

      console.log(`    ✅ 成功!`);
      console.log(`    响应 blocks: ${response.content?.length || 0}`);

      // 检查响应内容
      const textBlocks = response.content?.filter((b: any) => b.type === 'text') || [];
      console.log(`    文本 blocks: ${textBlocks.length}`);
      if (textBlocks.length > 0) {
        const firstText = textBlocks[0].text || '';
        console.log(`    首个 block 长度: ${firstText.length}`);
        console.log(`    首个 block 预览: ${firstText.slice(0, 200)}...`);
      }

      return { response, config: candidate };
    } catch (error) {
      console.log(`    ❌ 失败: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.log(`    Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      lastError = error;
    }
  }

  console.error(`\n❌ 所有模型都失败了:`);
  console.error(`  最后错误: ${lastError instanceof Error ? lastError.message : String(lastError)}`);

  throw lastError instanceof Error ? lastError : new Error('No available model candidate succeeded.');
}
