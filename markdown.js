// Shared, deliberately passive Markdown renderer: no raw HTML, navigation,
// embedded images, or remote resource requests from story content.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('markdown-it'));
  else root.storyMarkdown = factory(root.markdownit);
})(typeof window === 'undefined' ? globalThis : window, function (MarkdownIt) {
  const parser = new MarkdownIt({ html: false, linkify: false, typographer: false });
  parser.renderer.rules.link_open = () => '<span class="markdown-link">';
  parser.renderer.rules.link_close = () => '</span>';
  parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);
  return { render: text => parser.render(text || '') };
});
