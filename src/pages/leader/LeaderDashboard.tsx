import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Users, 
  Bell, 
  Clock, 
  BarChart3, 
  Menu,
  Moon,
  Sun,
  Code,
  Book,
  Coffee,
  Activity,
  Calendar,
  Flame,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Sidebar, SidebarItem } from '../../components/layout/Sidebar';
import { StudentsView } from '../admin/views/StudentsView';
import { LiveAttendanceView } from '../admin/views/LiveAttendanceView';
import apiClient from '../../services/apiClient';

export const LeaderDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState('');
  const [dynamicSessions, setDynamicSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Parse assigned sessions from current logged in user
  let assignedSessionsList: string[] = ['all'];
  if (user?.assigned_sessions) {
    if (Array.isArray(user.assigned_sessions)) {
      assignedSessionsList = user.assigned_sessions;
    } else if (typeof user.assigned_sessions === 'string') {
      try {
        assignedSessionsList = JSON.parse(user.assigned_sessions);
      } catch (e) {
        assignedSessionsList = [user.assigned_sessions];
      }
    }
  }

  const isAllSessions = assignedSessionsList.includes('all') || assignedSessionsList.length === 0;

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await apiClient.get('/students/sessions');
      if (response.data.success) {
        const rawSessions: any[] = response.data.data || [];
        // Filter sessions strictly to user's assigned sessions
        const allowedSessions = isAllSessions
          ? rawSessions
          : rawSessions.filter(s => 
              assignedSessionsList.some(k => String(k).toLowerCase() === String(s.session_key).toLowerCase())
            );
        setDynamicSessions(allowedSessions);

        if (allowedSessions.length > 0) {
          setActiveView(`session_${allowedSessions[0].session_key}`);
        } else {
          setActiveView('students');
        }
      }
    } catch (err) {
      console.error('Error fetching sessions', err);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (name?: string) => {
    const iconKey = String(name || '').toLowerCase().trim();
    switch (iconKey) {
      case 'moon':
      case 'night':
        return Moon;
      case 'sun':
      case 'morning':
        return Sun;
      case 'users':
      case 'sabha':
        return Users;
      case 'code':
      case 'coding':
        return Code;
      case 'book':
      case 'study':
        return Book;
      case 'coffee':
      case 'break':
        return Coffee;
      case 'activity':
      case 'sports':
        return Activity;
      case 'calendar':
      case 'event':
        return Calendar;
      case 'bell':
      case 'aarti':
      case 'arti':
        return Bell;
      case 'flame':
      case 'deep':
        return Flame;
      case 'smartphone':
        return Smartphone;
      case 'sparkles':
        return Sparkles;
      default:
        return Clock;
    }
  };

  const getSidebarItems = (): SidebarItem[] => {
    let items: SidebarItem[] = [];

    // Add only assigned sessions
    dynamicSessions.forEach(session => {
      items.push({
        id: `session_${session.session_key}`,
        label: session.session_name,
        icon: getIcon(session.icon_name),
      });
    });

    items.push({ id: 'students', label: 'My Floor Students', icon: Users });
    return items;
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const renderActiveView = () => {
    if (activeView === 'students') return <StudentsView />;
    if (activeView.startsWith('session_')) {
      const sessionKey = activeView.replace('session_', '');
      const currentSession = dynamicSessions.find(s => String(s.session_key).toLowerCase() === sessionKey.toLowerCase());
      return (
        <LiveAttendanceView 
          sessionKey={sessionKey} 
          sessionName={currentSession ? currentSession.session_name : sessionKey} 
        />
      );
    }
    return <div style={{ padding: '24px' }}><h3>Work in Progress: {activeView}</h3></div>;
  };

  const currentItem = getSidebarItems().find(item => item.id === activeView);

  return (
    <div className="admin-layout">
      <Sidebar 
        items={getSidebarItems()} 
        activeId={activeView} 
        onSelect={(id) => { setActiveView(id); setIsSidebarOpen(false); }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{currentItem?.label || 'Live Attendance'}</h2>
          </div>
          <button className="logout-btn" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer' }}>
            <LogOut size={16} /> Logout
          </button>
        </header>
        {renderActiveView()}
      </div>
    </div>
  );
};
