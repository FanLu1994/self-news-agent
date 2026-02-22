/**
 * 新闻总结工具 (使用 GLM-4.7)
 * 
 * 教学要点 (@mariozechner/pi-ai):
 * 1. 在工具内部调用 LLM
 * 2. 使用 getModel() 配置 GLM-4.7
 * 3. 构建 Context 对象
 * 4. 使用 complete() 进行 LLM 调用
 * 5. 处理 LLM 返回结果
 * 6. 提取 Token 使用统计
 * 7. 复杂提示词工程
 * 8. JSON 输出解析
 */

import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { Tool, Context } from '@mariozechner/pi-ai';
import { completeWithFallback, getConfiguredModel } from '../model.js';

/**
 * 新闻总结工具定义
 */
export const summarizeNewsTool: Tool = {
  name: 'summarize_news',
  
  description: `使用 GLM-4.7 AI 模型分析和总结新闻文章。
提供详细分析，包括主要话题、趋势、技术突破、行业影响和未来影响。
支持不同的总结风格：简要、详细或关键词。`,

  // 教学要点：定义参数
  parameters: Type.Object({
    newsData: Type.String({
      description: '包含 fetch_news 工具获取的新闻文章数据的 JSON 字符串。应包含带有 title、summary、source、url 等的 articles 数组。'
    }),
    
    style: StringEnum(['brief', 'detailed', 'keywords'] as const, {
      description: '总结风格：brief（3-5 个要点）、detailed（包含话题、趋势、影响的综合分析）、keywords（关键术语提取）',
      default: 'detailed'
    })
  }),

  // 教学要点：实现 execute 方法
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    console.log('\n🔧 summarize_news tool called');

    // 检查取消信号
    if (signal?.aborted) {
      throw new Error('Operation cancelled by user');
    }

    const modelConfig = getConfiguredModel();

    onUpdate?.({
      content: [{ type: 'text', text: `🤖 初始化 ${modelConfig.provider}/${modelConfig.model} 分析...` }],
      details: { progress: 10 }
    });

    // 解析新闻数据
    let newsJson: any;
    try {
      newsJson = JSON.parse(params.newsData);
    } catch (error) {
      throw new Error('新闻数据格式无效。期望从 fetch_news 工具获得的 JSON 字符串。');
    }

    if (!newsJson.articles || newsJson.articles.length === 0) {
      throw new Error('新闻数据中未找到文章。');
    }

    const articleCount = newsJson.articles.length;
    console.log(`  使用 ${modelConfig.provider}/${modelConfig.model} 分析 ${articleCount} 篇文章...`);

    onUpdate?.({
      content: [{ type: 'text', text: `🧠 ${modelConfig.provider}/${modelConfig.model} 正在分析 ${articleCount} 篇文章...` }],
      details: { progress: 30 }
    });

    // 根据风格构建不同的提示词
    const prompt = this.buildPrompt(params.style, newsJson);

    // 教学要点：构建 Context
    const context: Context = {
      systemPrompt: `你是一位专业的 AI 新闻分析师，对人工智能、机器学习和技术趋势有深入了解。
你的角色是分析 AI/技术新闻并提供有洞察力、准确的总结。
始终关注最重要的发展及其影响。`,
      
      messages: [
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now()
        }
      ]
    };

    try {
      // 教学要点：使用 complete() 调用 LLM
      console.log(`  调用 ${modelConfig.provider}/${modelConfig.model}...`);
      const completion = await completeWithFallback(context);
      const response = completion.response;
      const usedConfig = completion.config;

      onUpdate?.({
        content: [{ type: 'text', text: `✓ ${usedConfig.provider}/${usedConfig.model} 分析完成` }],
        details: { progress: 90 }
      });

      // 教学要点：提取文本内容
      const analysisText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      console.log(`  分析完成。长度：${analysisText.length} 字符`);
      console.log(`  实际使用模型：${usedConfig.provider}/${usedConfig.model}`);

      // 教学要点：提取 Token 使用统计
      const usage = response.usage;
      console.log(`  Token 使用：${usage.inputTokens} 输入，${usage.outputTokens} 输出，${usage.totalTokens} 总计`);
      console.log(`  成本：$${typeof usage.cost === 'number' ? usage.cost.toFixed(6) : usage.cost?.total?.toFixed(6) || '0.000000'}`);

      // 格式化输出
      let formattedOutput = `# AI 新闻总结报告\n\n`;
      formattedOutput += `**分析日期**：${new Date().toLocaleString('zh-CN')}\n`;
      formattedOutput += `**分析文章数**：${articleCount}\n`;
      formattedOutput += `**总结风格**：${params.style}\n`;
      formattedOutput += `**AI 模型**：${usedConfig.provider}/${usedConfig.model}\n\n`;
      formattedOutput += `---\n\n`;
      formattedOutput += analysisText;
      formattedOutput += `\n\n---\n\n`;
      
      // 添加 Token 使用信息
      formattedOutput += `## 📊 Token 使用统计\n\n`;
      formattedOutput += `- **输入 Token**：${usage.inputTokens?.toLocaleString() || 'N/A'}\n`;
      formattedOutput += `- **输出 Token**：${usage.outputTokens?.toLocaleString() || 'N/A'}\n`;
      formattedOutput += `- **总 Token**：${usage.totalTokens?.toLocaleString() || 'N/A'}\n`;
      formattedOutput += `- **成本**：$${typeof usage.cost === 'number' ? usage.cost.toFixed(6) : usage.cost?.total?.toFixed(6) || '0.000000'}\n`;

      // 教学要点：返回结构化结果
      return {
        content: [{
          type: 'text',
          text: formattedOutput
        }],
        details: {
          style: params.style,
          articlesAnalyzed: articleCount,
          tokenUsage: {
            input: usage.inputTokens || 0,
            output: usage.outputTokens || 0,
            total: usage.totalTokens || 0,
            cost: typeof usage.cost === 'number' ? usage.cost : (usage.cost?.total || 0)
          },
          model: usedConfig.model,
          provider: usedConfig.provider
        }
      };

    } catch (error) {
      console.error('❌ 模型分析错误:', error);
      
      // 详细的错误信息
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`${modelConfig.provider}/${modelConfig.model} 分析失败：${errorMessage}\n\n请检查：\n1. .env 中设置了对应厂商 API Key\n2. API 密钥有足够的配额\n3. 网络连接稳定`);
    }
  },

  /**
   * 根据风格构建提示词
   * 教学要点：提示词工程
   */
  buildPrompt(style: 'brief' | 'detailed' | 'keywords', newsJson: any): string {
    const articles = newsJson.articles;
    const articlesText = JSON.stringify(articles, null, 2);

    if (style === 'detailed') {
      return `你正在分析 ${articles.length} 篇 AI 和技术新闻文章。

请按以下 JSON 格式提供详细分析：

{
  "overview": "根据这些文章对当前 AI/技术格局的 2-3 句概述",
  "mainTopics": ["话题1", "话题2", "话题3"],
  "keyTrends": ["趋势1", "趋势2", "趋势3"],
  "detailedAnalysis": {
    "breakthroughs": ["提到的主要技术突破"],
    "industryImpacts": ["这些发展如何影响行业"],
    "futureImplications": ["这些对未来意味着什么"],
    "regionalInsights": {
      "international": "国际发展总结",
      "china": "中国特定发展总结"
    }
  },
  "topArticles": [
    {
      "title": "文章标题",
      "url": "文章 URL",
      "reason": "为什么这篇文章重要"
    }
  ],
  "categoryBreakdown": {"ai": 10, "ml": 5, "nlp": 3},
  "languageDistribution": {"en": 15, "zh": 5}
}

要求：
- 识别 3-5 个主要话题
- 提取 3-5 个关键趋势
- 列出主要技术突破
- 分析行业影响
- 预测未来影响
- 区分国际和中国洞察
- 选出 3-5 篇最重要的文章
- 计算类别和语言分布统计

新闻文章：
${articlesText}

仅返回 JSON 对象，不要额外的文本。`;

    } else if (style === 'brief') {
      return `用 3-5 个简洁的要点总结这 ${articles.length} 篇 AI/技术新闻文章。
只关注最重要的发展。

新闻文章：
${articlesText}

格式如下：
- 要点 1
- 要点 2
- 要点 3
...`;

    } else { // keywords
      return `从这 ${articles.length} 篇 AI/技术新闻文章中提取前 15-20 个关键词和关键短语。

新闻文章：
${articlesText}

以 JSON 数组形式返回：["关键词1", "关键词2", ...]
如果存在，请同时包含英文和中文关键词。`;
    }
  }
};
