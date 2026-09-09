const {test}=require('node:test');
const assert=require('node:assert/strict');
const {render}=require('../markdown');
const {exportStory}=require('../story-export');
test('Markdown renders fiction formatting and block structure',()=>{
  const html=render('# Heading\n\n*quiet* and **loud**\n\n---\n\n> Remember\n\n- One\n- Two');
  for(const tag of ['h1','em','strong','hr','blockquote','ul','li'])assert.match(html,new RegExp('<'+tag+'[ >]'));
});
test('story content cannot inject HTML, navigate, or load resources',()=>{
  const html=render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![secret](https://example.com/track)\n\n[link](https://example.com)\n\n[bad](javascript:alert(1))');
  assert.doesNotMatch(html,/<(?:script|img|iframe|a)\b/i);
  assert.doesNotMatch(html,/<[^>]*\s(?:href|src|onerror)=/i);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/secret/);
});
test('Markdown export preserves chapter source instead of escaping formatting',()=>{
  const content='*Italic* and **bold**\n\n---\n\nA scene.';
  assert.ok(exportStory({title:'Title',chapters:[{name:'Chapter',content}]},'md').includes(content));
});
test('HTML export renders Markdown while escaping raw HTML and chapter titles',()=>{
  const html=exportStory({title:'<Title>',chapters:[{name:'<Chapter>',content:'*Italic* and **bold**\n\n---\n\n<script>alert(1)</script>'}]},'html');
  assert.match(html,/<em>Italic<\/em> and <strong>bold<\/strong>/);
  assert.match(html,/<hr>/);
  assert.match(html,/<h2>&lt;Chapter&gt;<\/h2>/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});
