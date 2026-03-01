export interface CompressibleContext {
  recentMessages: Array<{ sender: string; content: string; timestamp: Date }>;
  semanticMemories: Array<{ summary: string; importance: number }>;
  knowledgeChunks: Array<{ content: string; documentTitle: string; source: string; similarity: number }>;
  entities: Array<{ name: string; type: string }>;
}

// Rough token estimation: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function compressContext(
  context: CompressibleContext,
  maxTokens: number = 4000,
): CompressibleContext {
  let budget = maxTokens;
  const result: CompressibleContext = {
    recentMessages: [],
    semanticMemories: [],
    knowledgeChunks: [],
    entities: [],
  };

  // 1. Entities are cheap — include top 10
  const entityBudget = Math.min(budget * 0.05, 200);
  let entityTokens = 0;
  for (const entity of context.entities.slice(0, 10)) {
    const tokens = estimateTokens(`${entity.name} (${entity.type})`);
    if (entityTokens + tokens > entityBudget) break;
    result.entities.push(entity);
    entityTokens += tokens;
  }
  budget -= entityTokens;

  // 2. Recent messages — last 10, truncate long ones
  const messageBudget = budget * 0.4;
  let messageTokens = 0;
  const recentMessages = context.recentMessages.slice(-10);
  for (const msg of recentMessages) {
    let content = msg.content;
    if (content.length > 500) {
      content = content.slice(0, 497) + '...';
    }
    const tokens = estimateTokens(`${msg.sender}: ${content}`);
    if (messageTokens + tokens > messageBudget) break;
    result.recentMessages.push({ ...msg, content });
    messageTokens += tokens;
  }
  budget -= messageTokens;

  // 3. Semantic memories — top 5 by importance/relevance
  const memoryBudget = budget * 0.3;
  let memoryTokens = 0;
  const sortedMemories = [...context.semanticMemories].sort((a, b) => b.importance - a.importance);
  for (const mem of sortedMemories.slice(0, 5)) {
    const tokens = estimateTokens(mem.summary);
    if (memoryTokens + tokens > memoryBudget) break;
    result.semanticMemories.push(mem);
    memoryTokens += tokens;
  }
  budget -= memoryTokens;

  // 4. Knowledge chunks — remaining budget
  let knowledgeTokens = 0;
  const sortedChunks = [...context.knowledgeChunks].sort((a, b) => b.similarity - a.similarity);
  for (const chunk of sortedChunks.slice(0, 5)) {
    const tokens = estimateTokens(chunk.content);
    if (knowledgeTokens + tokens > budget) break;
    result.knowledgeChunks.push(chunk);
    knowledgeTokens += tokens;
  }

  return result;
}
