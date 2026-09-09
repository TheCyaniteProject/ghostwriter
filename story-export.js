const formats = { md: 'Markdown', txt: 'Plain text', html: 'HTML', rtf: 'Rich text' };
const htmlEscape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const markdownEscape = text => text.replace(/([\\`*_{}\[\]()<>#+.!|~-])/g, '\\$1');
function rtfEscape(text) {
  return text.replace(/\r\n?/g, '\n').split('').map(c => {
    if ('\\{}'.includes(c)) return '\\' + c;
    if (c === '\n') return '\\par\n';
    if (c === '\t') return '\\tab ';
    const code = c.charCodeAt(0);
    return code > 127 ? '\\u' + (code > 32767 ? code - 65536 : code) + '?' : c;
  }).join('');
}
function exportStory(story, format) {
  if (!Object.hasOwn(formats, format)) throw new Error('Choose a supported export format.');
  if (!story || typeof story.title !== 'string' || !Array.isArray(story.chapters) ||
      story.chapters.some(c => !c || typeof c.name !== 'string' || typeof c.content !== 'string')) {
    throw new Error('Invalid story content.');
  }
  const chapters = story.chapters.filter(c => c.content.trim());
  if (!chapters.length) throw new Error('Publish a chapter to Story before exporting.');
  const title = story.title || 'Untitled Story';
  if (format === 'txt') return [title, ...chapters.flatMap(c => [c.name, c.content])].join('\n\n') + '\n';
  if (format === 'md') return '# ' + markdownEscape(title) + '\n\n' + chapters.map(c => '## ' + markdownEscape(c.name) + '\n\n' + markdownEscape(c.content)).join('\n\n') + '\n';
  if (format === 'html') return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEscape(title) + '</title><style>body{max-width:48rem;margin:3rem auto;padding:0 1.5rem;font:18px/1.7 Georgia,serif}p{white-space:pre-wrap}</style></head><body><h1>' + htmlEscape(title) + '</h1>' + chapters.map(c => '<section><h2>' + htmlEscape(c.name) + '</h2><p>' + htmlEscape(c.content) + '</p></section>').join('\n') + '</body></html>\n';
  return '{\\rtf1\\ansi\\uc1\\deff0{\\fonttbl{\\f0 Georgia;}}\n\\f0\\fs24\n{\\b\\fs36 ' + rtfEscape(title) + '}\\par\\par\n' + chapters.map(c => '{\\b\\fs28 ' + rtfEscape(c.name) + '}\\par\n' + rtfEscape(c.content) + '\\par\\par\n').join('') + '}\n';
}
module.exports = { formats, exportStory };
