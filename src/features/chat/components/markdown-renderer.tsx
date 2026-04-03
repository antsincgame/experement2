import { View, Text, Platform, ScrollView } from 'react-native';

// Web-only syntax highlighter (same pattern as code-viewer.tsx)
let SyntaxHighlighter: typeof import('react-syntax-highlighter').default | null = null;
let syntaxTheme: Record<string, React.CSSProperties> | null = null;

if (Platform.OS === 'web') {
  try {
    const rsh = require('react-syntax-highlighter');
    const styles = require('react-syntax-highlighter/dist/esm/styles/prism');
    SyntaxHighlighter = rsh.Prism;
    syntaxTheme = styles.oneDark;
  } catch {
    // fallback without syntax highlighting
  }
}

interface MarkdownRendererProps {
  content: string;
}

const CODE_FONT = '"JetBrains Mono", "Fira Code", monospace';

interface ParsedBlock {
  type: 'paragraph' | 'code' | 'heading' | 'list' | 'blockquote' | 'hr';
  content: string;
  lang?: string;
  level?: number;
  ordered?: boolean;
  items?: string[];
}

const parseMarkdown = (text: string): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```lang ... ``` (closing must be standalone ``` line)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const trimmed = lines[i].trim();
        // Closing fence: line is exactly ``` (possibly with trailing whitespace)
        if (trimmed === '```' || trimmed === '````') break;
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang: lang || undefined });
      if (i < lines.length) i++; // skip closing ```
      continue;
    }

    // Horizontal rule
    if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].trimStart().slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', items, ordered: false });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', items, ordered: true });
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('> ') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^---+$|^\*\*\*+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
};

// Renders inline markdown: **bold**, *italic*, `code`, [link](url)
const renderInlineMarkdown = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic: *text*
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    // Inline code: `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link: [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find earliest match
    const matches = [
      boldMatch ? { m: boldMatch, type: 'bold' as const } : null,
      italicMatch ? { m: italicMatch, type: 'italic' as const } : null,
      codeMatch ? { m: codeMatch, type: 'code' as const } : null,
      linkMatch ? { m: linkMatch, type: 'link' as const } : null,
    ].filter(Boolean).sort((a, b) => (a!.m.index ?? 0) - (b!.m.index ?? 0));

    if (matches.length === 0) {
      parts.push(<Text key={key++}>{remaining}</Text>);
      break;
    }

    const first = matches[0]!;
    const idx = first.m.index ?? 0;

    // Text before match
    if (idx > 0) {
      parts.push(<Text key={key++}>{remaining.slice(0, idx)}</Text>);
    }

    if (first.type === 'bold') {
      parts.push(
        <Text key={key++} style={{ fontWeight: '700', color: '#2D2D4A' }}>
          {first.m[1]}
        </Text>
      );
    } else if (first.type === 'italic') {
      parts.push(
        <Text key={key++} style={{ fontStyle: 'italic' }}>
          {first.m[1]}
        </Text>
      );
    } else if (first.type === 'code') {
      parts.push(
        <Text
          key={key++}
          style={{
            fontFamily: CODE_FONT,
            fontSize: 12,
            color: '#D946EF',
            backgroundColor: 'rgba(217, 70, 239, 0.08)',
            paddingHorizontal: 4,
            borderRadius: 3,
          }}
        >
          {first.m[1]}
        </Text>
      );
    } else if (first.type === 'link') {
      parts.push(
        <Text
          key={key++}
          style={{ color: '#00BCD4', textDecorationLine: 'underline' }}
          onPress={() => { if (typeof window !== 'undefined') window.open(first.m[2], '_blank'); }}
        >
          {first.m[1]}
        </Text>
      );
    }

    remaining = remaining.slice(idx + first.m[0].length);
  }

  return parts;
};

const renderCodeBlock = (content: string, lang?: string) => {
  if (SyntaxHighlighter && syntaxTheme && lang) {
    const Highlighter = SyntaxHighlighter;
    return (
      <View style={{ marginVertical: 6, borderRadius: 8, overflow: 'hidden' }}>
        <View
          style={{
            backgroundColor: '#1E1E2E',
            paddingHorizontal: 12,
            paddingVertical: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#666', fontSize: 9, fontFamily: CODE_FONT, textTransform: 'uppercase', letterSpacing: 1 }}>
            {lang}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Highlighter
            language={lang}
            style={syntaxTheme!}
            customStyle={{
              margin: 0,
              padding: 12,
              backgroundColor: '#1E1E2E',
              fontSize: 12,
              lineHeight: 1.5,
              fontFamily: CODE_FONT,
              borderRadius: 0,
            }}
            codeTagProps={{ style: { fontFamily: CODE_FONT, fontSize: 12 } }}
          >
            {content}
          </Highlighter>
        </ScrollView>
      </View>
    );
  }

  // Fallback: plain code block
  return (
    <View style={{ marginVertical: 6, borderRadius: 8, backgroundColor: '#1E1E2E', padding: 12 }}>
      {lang && (
        <Text style={{ color: '#666', fontSize: 9, fontFamily: CODE_FONT, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          {lang}
        </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={{ color: '#D4D4D4', fontFamily: CODE_FONT, fontSize: 12, lineHeight: 18 }}>
          {content}
        </Text>
      </ScrollView>
    </View>
  );
};

const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const blocks = parseMarkdown(content);

  return (
    <View>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const sizes = [18, 15, 13];
            return (
              <Text
                key={i}
                style={{
                  fontSize: sizes[(block.level ?? 1) - 1] ?? 13,
                  fontWeight: '700',
                  color: '#2D2D4A',
                  marginBottom: 4,
                  marginTop: i > 0 ? 8 : 0,
                }}
              >
                {renderInlineMarkdown(block.content)}
              </Text>
            );
          }

          case 'code':
            return <View key={i}>{renderCodeBlock(block.content, block.lang)}</View>;

          case 'list':
            return (
              <View key={i} style={{ marginBottom: 6 }}>
                {block.items?.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 4 }}>
                    <Text style={{ color: '#7C4DFF', fontSize: 13, lineHeight: 20, marginRight: 6, fontWeight: '600', width: 16 }}>
                      {block.ordered ? `${j + 1}.` : '•'}
                    </Text>
                    <Text style={{ color: '#4A4A6A', fontSize: 13, lineHeight: 20, flex: 1 }}>
                      {renderInlineMarkdown(item)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case 'blockquote':
            return (
              <View
                key={i}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: '#7C4DFF',
                  paddingLeft: 12,
                  paddingVertical: 4,
                  marginBottom: 6,
                  backgroundColor: 'rgba(124, 77, 255, 0.04)',
                  borderRadius: 4,
                }}
              >
                <Text style={{ color: '#6A6A8A', fontSize: 13, lineHeight: 20, fontStyle: 'italic' }}>
                  {renderInlineMarkdown(block.content)}
                </Text>
              </View>
            );

          case 'hr':
            return <View key={i} style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 8 }} />;

          case 'paragraph':
          default:
            return (
              <Text key={i} style={{ color: '#4A4A6A', fontSize: 13, lineHeight: 20, marginBottom: 6 }}>
                {renderInlineMarkdown(block.content)}
              </Text>
            );
        }
      })}
    </View>
  );
};

export default MarkdownRenderer;
