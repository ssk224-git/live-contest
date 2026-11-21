// Loads the code editor only when a page needs it (keeps the quiz pages small and fast on phones).
import { lazy, Suspense } from 'react';

const CodeEditor = lazy(() => import('./CodeEditor.jsx'));

export default function LazyCodeEditor(props) {
  return (
    <Suspense fallback={<div className="grid place-items-center rounded-lg bg-slate-900 text-sm text-slate-400" style={{ height: props.height || '420px' }}>Loading editor…</div>}>
      <CodeEditor {...props} />
    </Suspense>
  );
}
