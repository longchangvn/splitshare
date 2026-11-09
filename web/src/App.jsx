import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, Guard } from './auth.jsx';
import { Login, Register, Forgot, Reset, Verify } from './pages/AuthPages.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { GroupDetail } from './pages/GroupDetail.jsx';
import { Profile } from './pages/Profile.jsx';
import { InvitePage } from './pages/InvitePage.jsx';
import { Statement } from './pages/Statement.jsx';
import { Report } from './pages/Report.jsx';
import { SharePage } from './pages/SharePage.jsx';
import { ExpenseDetail, JoinPage } from './pages/ExpenseDetail.jsx';
import { InvitationPage } from './pages/InvitationPage.jsx';
import './styles.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset/:token" element={<Reset />} />
          <Route path="/verify/:token" element={<Verify />} />
          <Route path="/s/:token" element={<SharePage />} />
          {/* Public route: anonymous visitors get an invite landing with
              return-to auth links; authed visitors join automatically. */}
          <Route path="/g/:token" element={<JoinPage />} />
          {/* Public: emailed per-address invitation — create account (password or Google) and join. */}
          <Route path="/invite/:token" element={<InvitationPage />} />
          <Route path="/invite/:token/:step" element={<InvitationPage />} />
          <Route path="/profile" element={<Guard><Profile /></Guard>} />
          {/* Settings page removed with group templates; keep old links working. */}
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route path="/groups/:id/invite" element={<Guard><InvitePage /></Guard>} />
          <Route path="/groups/:id/statement" element={<Guard><Statement /></Guard>} />
          <Route path="/groups/:id/report" element={<Guard><Report /></Guard>} />
          <Route path="/groups" element={<Guard><Dashboard /></Guard>} />
          <Route path="/add" element={<Navigate to="/" replace />} />
          <Route path="/activity" element={<Guard><Dashboard /></Guard>} />
          <Route path="/groups/:id" element={<Guard><GroupDetail /></Guard>} />
          <Route path="/groups/:id/expenses/:eid" element={<Guard><ExpenseDetail /></Guard>} />
          <Route path="/" element={<Guard><Dashboard /></Guard>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
