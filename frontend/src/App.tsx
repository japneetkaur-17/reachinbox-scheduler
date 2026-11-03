import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './context/AuthContext';
import { StatsProvider } from './context/StatsContext';
import { AppLayout } from './components/layout/AppLayout';
import { FullPageSpinner } from './components/ui/Spinner';
import { LoginPage } from './pages/LoginPage';
import { MailboxPage } from './pages/MailboxPage';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';

/** Gate for signed-in pages; also provides the sidebar counts. */
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <StatsProvider>{children}</StatsProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/scheduled" element={<MailboxPage key="scheduled" tab="scheduled" />} />
        <Route path="/sent" element={<MailboxPage key="sent" tab="sent" />} />
      </Route>

      {/* Full-width screens (no sidebar), as in the design */}
      <Route
        path="/compose"
        element={
          <Protected>
            <ComposePage />
          </Protected>
        }
      />
      <Route
        path="/email/:id"
        element={
          <Protected>
            <EmailDetailPage />
          </Protected>
        }
      />

      <Route path="/dashboard" element={<Navigate to="/scheduled" replace />} />
      <Route path="*" element={<Navigate to="/scheduled" replace />} />
    </Routes>
  );
}
