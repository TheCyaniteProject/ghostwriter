const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exportStory } = require('../story-export');
const { markdownRtf, escapeRtf } = require('../rtf');

test('RTF renders nested bold and italic without leaving Markdown delimiters', () => {
  const result = markdownRtf('*At midnight* **off the quilt** and ***both***.');
  assert.match(result, /\{\\i At midnight\}/);
  assert.match(result, /\{\\b off the quilt\}/);
  assert.match(result, /\{\\i \{\\b both\}\}/);
  assert.doesNotMatch(result, /\*/);
});

test('RTF handles paragraphs, headings, nested lists, quotes, breaks, and code', () => {
  const result = markdownRtf('# Heading\n\n> Quote\n\n3. Third\n   - Nested\n4. Fourth\n\n---\n\n`*literal*`\n\n```\n**code**\nnext\n```');
  assert.match(result, /\\b\\fs36 Heading/);
  assert.match(result, /\\li360 Quote/);
  assert.match(result, /3\.\\tab Third/);
  assert.match(result, /4\.\\tab Fourth/);
  assert.match(result, /\\li720/);
  assert.match(result, /\\qc \* \* \*/);
  assert.match(result, /\{\\f1 \*literal\*\}/);
  assert.match(result, /\*\*code\*\*\\line\nnext/);
});

test('RTF escapes source control sequences, Unicode, and inert HTML', () => {
  assert.equal(escapeRtf('{\\field} café 😀'), '\\{\\\\field\\} caf\\u233? \\u-10179?\\u-8704?');
  const result = markdownRtf('`{\\field dangerous}`\n\n<script>bad()</script>\n\n[Read](https://example.com) ![Picture](https://example.com/a.png)');
  assert.match(result, /\\\{\\\\field dangerous\\\}/);
  assert.match(result, /<script>bad\(\)<\/script>/);
  assert.match(result, /Read Picture/);
  assert.doesNotMatch(result, /https:|HYPERLINK|\\pict/);
});

test('complete RTF includes fonts and styled body while Markdown export stays raw', () => {
  const story = { title: 'Book', chapters: [{ name: 'One', content: '**Bold** and *italic*' }] };
  const result = exportStory(story, 'rtf');
  assert.ok(result.startsWith('{\\rtf1'));
  assert.match(result, /Courier New/);
  assert.match(result, /\{\\b Bold\}/);
  assert.match(result, /\{\\i italic\}/);
  assert.ok(exportStory(story, 'md').includes(story.chapters[0].content));
});
