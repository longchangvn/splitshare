import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, Guard } from './auth.jsx';
import { Login, Register } from './pages/AuthPages.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { GroupDetail } from './pages/GroupDetail.jsx';
import { Profile } from './pages/Profile.jsx';
import { InvitePage } from './pages/InvitePage.jsx';
import { ExpenseDetail, JoinPage } from './pages/ExpenseDetail.jsx';
import './styles.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/g/:token" element={<Guard><JoinPage /></Guard>} />
          <Route path="/profile" element={<Guard><Profile /></Guard>} />
          <Route path="/groups/:id/invite" element={<Guard><InvitePage /></Guard>} />
          <Route path="/groups/:id" element={<Guard><GroupDetail /></Guard>} />
          <Route path="/groups/:id/expenses/:eid" element={<Guard><ExpenseDetail /></Guard>} />
          <Route path="/" element={<Guard><Dashboard /></Guard>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
