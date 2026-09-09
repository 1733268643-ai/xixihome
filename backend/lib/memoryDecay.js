// 记忆浮沉：每小时让 memories 表里的记忆自然衰减一点权重。
// 常被想起的记忆（被 breath 命中）会在 store.bumpMemoryWeight 里回升，抵消这里的衰减。
import * as store from './store.js';

export async function decayTick() {
  const count = await store.decayAllMemories(1);
  console.log(`🌊 记忆衰减：处理了 ${count} 条`);
  return { count, time: new Date().toISOString() };
}
