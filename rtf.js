const { parse } = require('./markdown');

function escapeRtf(text) {
  return text.replace(/\r\n?/g, '\n').split('').map(c => {
    if ('\\{}'.includes(c)) return '\\' + c;
    if (c === '\n') return '\\line\n';
    if (c === '\t') return '\\tab ';
    const code = c.charCodeAt(0);
    if (code < 32) return '';
    return code > 127 ? '\\u' + (code > 32767 ? code - 65536 : code) + '?' : c;
  }).join('');
}

function inlineRtf(tokens) {
  return (tokens || []).map(token => {
    switch (token.type) {
      case 'strong_open': return '{\\b ';
      case 'em_open': return '{\\i ';
      case 's_open': return '{\\strike ';
      case 'strong_close': case 'em_close': case 's_close': return '}';
      case 'code_inline': return '{\\f1 ' + escapeRtf(token.content) + '}';
      case 'hardbreak': return '\\line\n';
      case 'softbreak': return ' ';
      // Preserve readable labels without embedding links or external resources.
      case 'link_open': case 'link_close': return '';
      case 'image': return escapeRtf(token.content);
      default: return escapeRtf(token.content || '');
    }
  }).join('');
}

function markdownRtf(source) {
  const lists = [], items = [];
  let quoteDepth = 0;
  let output = '';
  const paragraph = (style = '') => {
    const indent = (quoteDepth + lists.length) * 360;
    const item = items.at(-1);
    let marker = '';
    if (item?.pending) { marker = escapeRtf(item.marker) + '\\tab '; item.pending = false; }
    return '{\\pard\\f0\\fs24\\sa160\\li' + indent +
      (marker ? '\\fi-240\\tx' + indent : '') + style + ' ' + marker;
  };
  for (const token of parse(source)) {
    switch (token.type) {
      case 'paragraph_open': output += paragraph(); break;
      case 'paragraph_close': output += '\\par}\n'; break;
      case 'heading_open': {
        const size = [36, 32, 28, 26, 24, 24][Number(token.tag.slice(1)) - 1] || 24;
        output += paragraph('\\b\\fs' + size); break;
      }
      case 'heading_close': output += '\\par}\n'; break;
      case 'inline': output += inlineRtf(token.children); break;
      case 'blockquote_open': quoteDepth++; break;
      case 'blockquote_close': quoteDepth--; break;
      case 'bullet_list_open': lists.push({ ordered: false }); break;
      case 'ordered_list_open': lists.push({ ordered: true, next: Number(token.attrGet('start') || 1) }); break;
      case 'bullet_list_close': case 'ordered_list_close': lists.pop(); break;
      case 'list_item_open': {
        const list = lists.at(-1);
        items.push({ pending: true, marker: list.ordered ? list.next++ + '.' : '•' }); break;
      }
      case 'list_item_close': items.pop(); break;
      case 'fence': case 'code_block':
        output += paragraph('\\f1') + escapeRtf(token.content.replace(/\n$/, '')) + '\\par}\n'; break;
      case 'hr': output += paragraph('\\qc') + '* * *\\par}\n'; break;
      // Portable text rows for tables; inline styling in cells is retained.
      case 'tr_open': output += paragraph(); break;
      case 'tr_close': output += '\\par}\n'; break;
      case 'th_open': output += '{\\b '; break;
      case 'th_close': output += '}\\tab '; break;
      case 'td_close': output += '\\tab '; break;
    }
  }
  return output;
}

module.exports = { escapeRtf, markdownRtf };
