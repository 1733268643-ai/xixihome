import assert from 'node:assert/strict';
import { imageOf, linkOf, textOf } from './bridge-message.js';

const oldText = { ts: 1, role: 'user', text: '今晚想你', source: 'bridge' };
assert.equal(textOf(oldText), '今晚想你');
assert.equal(linkOf(oldText), null);
assert.equal(imageOf(oldText), '');

const windowsPath = { type: 'image', image: { path: 'C:\\secret\\a.png' } };
assert.equal(imageOf(windowsPath), '');

const served = { type: 'image', image: { url: '/api/bridge/images/abc' }, text: '你看' };
assert.equal(imageOf(served), '/api/bridge/images/abc');
assert.equal(textOf(served), '你看');
assert.equal(linkOf(served), null);

const link = { type: 'link', link: { url: 'https://example.com/a', title: '' } };
assert.equal(linkOf(link).url, 'https://example.com/a');
assert.equal(linkOf(link).title, 'example.com');

const inline = { text: '看这个 https://example.com/a。' };
assert.equal(linkOf(inline).url, 'https://example.com/a');
assert.equal(textOf(inline), '看这个');

console.log('bridge-message ok');
