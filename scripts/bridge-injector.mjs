#!/usr/bin/env node
import { createInterface } from 'readline';
import { appendFile } from 'fs/promises';

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on('line', async (line) => {
  try {
    const data = JSON.parse(line);
    const entry = {
      ...data,
      timestamp: new Date().toISOString()
    };
    await appendFile(process.env.BRIDGE_INBOX || '/tmp/xixihome-bridge-inbox.jsonl', JSON.stringify(entry) + '\n', 'utf8');
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

rl.on('error', () => process.exit(1));
