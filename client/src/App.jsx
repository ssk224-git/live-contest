// The list of pages (routes). Host pages are wrapped in <RequireHost> (must be logged in).
import { Routes, Route } from 'react-router';
import { AuthProvider, RequireHost } from './lib/auth.jsx';
import HomePage from './pages/HomePage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import QuizEditorPage from './pages/QuizEditorPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import HostPage from './pages/HostPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ContestEditorPage from './pages/ContestEditorPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/status" element={<StatusPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireHost>
              <DashboardPage />
            </RequireHost>
          }
        />
        <Route
          path="/quizzes/new"
          element={
            <RequireHost>
              <QuizEditorPage />
            </RequireHost>
          }
        />
        <Route
          path="/quizzes/:id"
          element={
            <RequireHost>
              <QuizEditorPage />
            </RequireHost>
          }
        />
        <Route
          path="/host/:code"
          element={
            <RequireHost>
              <HostPage />
            </RequireHost>
          }
        />
        <Route path="/play/:code" element={<PlayPage />} />
        <Route
          path="/contests/new"
          element={
            <RequireHost>
              <ContestEditorPage />
            </RequireHost>
          }
        />
        <Route
          path="/contests/:id"
          element={
            <RequireHost>
              <ContestEditorPage />
            </RequireHost>
          }
        />
        <Route
          path="/history"
          element={
            <RequireHost>
              <HistoryPage />
            </RequireHost>
          }
        />
        <Route path="*" element={<p className="p-8">Page not found.</p>} />
      </Routes>
    </AuthProvider>
  );
}
