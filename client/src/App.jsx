// The list of pages (routes). M0: just a status page.
import { Routes, Route } from 'react-router';
import StatusPage from './pages/StatusPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<StatusPage />} />
    </Routes>
  );
}
