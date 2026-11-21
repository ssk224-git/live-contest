// A code editor with syntax highlighting (CodeMirror 6). Loaded lazily (see LazyCodeEditor.jsx),
// so quiz players never download it.
import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';

const MODES = { cpp, python, javascript, java };

export default function CodeEditor({ language, value, onChange, height = '420px', readOnly = false }) {
  const extensions = useMemo(() => [MODES[language] ? MODES[language]() : []], [language]);
  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{ tabSize: 4, foldGutter: false }}
      className="overflow-hidden rounded-lg border border-slate-700 text-sm"
    />
  );
}
