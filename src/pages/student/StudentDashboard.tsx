import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Moon, 
  BookOpen, 
  Sparkles, 
  RotateCw, 
  LogOut, 
  Phone, 
  CheckCircle, 
  Fingerprint, 
  AlertTriangle, 
  X,
  Calendar,
  Layers,
  DoorClosed
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { connectToESP32 } from '../../services/bleService';
import { RadarAnimation } from '../../components/RadarAnimation';
import './StudentDashboard.css';

interface StudentProfile {
  id: number | string;
  student_code: string;
  name: string;
  room: string;
  floor_id: number | string;
  phone: string;
  tags: Array<{ id: number; name: string; color?: string }>;
}

interface ScheduleItem {
  session_key: string;
  session_name: string;
  icon_name?: string;
  start_time: string;
  end_time: string;
  late_time?: string | null;
  status: 'marked' | 'live' | 'closed' | 'upcoming';
  is_marked?: boolean;
  is_open_now?: boolean;
  is_closed?: boolean;
  is_upcoming?: boolean;
  is_active_today?: boolean;
  marked_at?: string | null;
}

export const StudentDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingSession, setMarkingSession] = useState<ScheduleItem | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState('');
  const [markSuccess, setMarkSuccess] = useState('');

  const [unauthorizedModal, setUnauthorizedModal] = useState<{
    show: boolean;
    message: string;
    countdown: number;
  }>({
    show: false,
    message: '',
    countdown: 3
  });

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  // Handle unauthorized auto-logout countdown
  useEffect(() => {
    if (!unauthorizedModal.show) return;
    if (unauthorizedModal.countdown <= 0) {
      logout();
      window.location.href = '/login';
      return;
    }
    const timer = setTimeout(() => {
      setUnauthorizedModal(prev => ({ ...prev, countdown: prev.countdown - 1 }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [unauthorizedModal.show, unauthorizedModal.countdown, logout]);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await apiClient.get('/attendance/my-status');
      if (response.data && (response.data.success || response.data.status === 'ok')) {
        const payload = response.data.data || response.data;
        
        if (payload.student) {
          setStudentProfile(payload.student);
        } else if (user) {
          setStudentProfile({
            id: user.name || '',
            student_code: '',
            name: user.name || 'Student',
            room: user.room || 'N/A',
            floor_id: user.floor_id || '',
            phone: user.phone || '',
            tags: []
          });
        }

        const rawSchedules = payload.all_schedules || [];
        if (Array.isArray(rawSchedules)) {
          setSchedules(rawSchedules);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenMarkModal = (session: ScheduleItem) => {
    setMarkingSession(session);
    setMarkError('');
    setMarkSuccess('');
  };

  const handleTriggerMarkAttendance = async (session: ScheduleItem) => {
    setIsMarking(true);
    setMarkError('');
    setMarkSuccess('');

    try {
      // 1. Connect to ESP32 GATT service and exchange challenge token
      const bleConnection = await connectToESP32();
      let tokenToUse = bleConnection.token;

      // 2. Disconnect from ESP32 immediately to free up BLE slot for classmates
      bleConnection.disconnect();

      // 3. Submit verified token with session_key to backend
      const res = await apiClient.post('/attendance/mark', {
        proof: tokenToUse,
        rssi: -50,
        session_key: session.session_key
      });

      if (res.data.success) {
        setMarkSuccess(`Attendance recorded for ${session.session_name}!`);
        // Update local session status immediately
        setSchedules(prev => prev.map(s => {
          if (s.session_key === session.session_key) {
            return { ...s, status: 'marked', is_marked: true };
          }
          return s;
        }));
        setTimeout(() => {
          setMarkingSession(null);
          setMarkSuccess('');
        }, 1800);
      } else {
        throw new Error(res.data.message || 'Failed to mark attendance.');
      }
    } catch (err: any) {
      const respData = err.response?.data;
      if (
        err.response?.status === 403 && 
        (respData?.code === 'UNAUTHORIZED_DEVICE_OR_BROWSER' || respData?.message?.toLowerCase().includes('not authorized'))
      ) {
        setUnauthorizedModal({
          show: true,
          message: respData?.message || 'You are not authorized. Please login again.',
          countdown: 3
        });
        return;
      }
      setMarkError(err.response?.data?.message || err.message || 'An unexpected error occurred during attendance marking.');
    } finally {
      setIsMarking(false);
    }
  };

  // Format today's date banner string (e.g. "FRIDAY, 9 OCTOBER")
  const getTodayDateHeader = () => {
    try {
      const now = new Date();
      return now.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Kolkata'
      }).toUpperCase();
    } catch (e) {
      return 'TODAY';
    }
  };

  // Initials generator (e.g. Harshil Patel -> HP)
  const getInitials = (name?: string) => {
    if (!name) return 'S';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getSessionIcon = (session: ScheduleItem) => {
    const key = (session.session_key || '').toLowerCase();
    const name = (session.session_name || '').toLowerCase();
    if (key.includes('night') || name.includes('night')) {
      return (
        <div className="session-icon-box moon-icon">
          <Moon size={22} />
        </div>
      );
    }
    if (key.includes('aarti') || key.includes('assembly') || name.includes('aarti') || name.includes('assembly') || name.includes('meeting')) {
      return (
        <div className="session-icon-box users-icon">
          <Users size={22} />
        </div>
      );
    }
    return (
      <div className="session-icon-box class-icon">
        <BookOpen size={22} />
      </div>
    );
  };

  const displayName = studentProfile?.name || user?.name || 'Student';
  const displayId = studentProfile?.student_code || studentProfile?.id || '';
  const displayRoom = studentProfile?.room || user?.room || '913';
  const displayFloor = studentProfile?.floor_id !== undefined && studentProfile?.floor_id !== null ? studentProfile?.floor_id : (user?.floor_id || '9');
  const displayPhone = studentProfile?.phone || user?.phone || '9725714912';

  return (
    <div className="student-dashboard-root">
      <div className="student-dashboard-container">
        
        {/* Top Header */}
        <header className="student-header">
          <div>
            <div className="student-date-badge">
              <Calendar size={14} />
              <span>{getTodayDateHeader()}</span>
            </div>
            <h1 className="student-header-title">Attendance</h1>
            <p className="student-header-subtitle">Daily routine & verification</p>
          </div>
          
          <div className="student-header-actions">
            <button 
              className="student-icon-btn" 
              onClick={fetchStatus} 
              title="Refresh Schedule"
            >
              <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button 
              className="student-icon-btn" 
              onClick={logout} 
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Student Profile Card */}
        <div className="student-profile-card">
          <div className="profile-top-row">
            <div className="profile-avatar-circle">
              {getInitials(displayName)}
            </div>
            
            <div className="profile-main-info">
              <h2 className="profile-student-name">{displayName}</h2>
              
              <div className="profile-badges-row">
                {displayId && (
                  <span className="pill-badge id-badge">
                    🪪 {displayId}
                  </span>
                )}
                <span className="pill-badge room-badge">
                  🚪 Room {displayRoom}
                </span>
                <span className="pill-badge floor-badge">
                  🏢 Floor {displayFloor}
                </span>
                {studentProfile?.tags && studentProfile.tags.map(t => (
                  <span 
                    key={`tag_${t.id}`} 
                    className="pill-badge custom-tag-badge"
                    style={{ 
                      backgroundColor: t.color ? `${t.color}18` : '#ede9fe',
                      color: t.color || '#6d28d9'
                    }}
                  >
                    👥 {t.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="profile-bottom-row">
            <div className="profile-phone-info">
              <Phone size={14} color="#64748b" />
              <span>{displayPhone}</span>
            </div>

            <div className="verified-pill">
              <CheckCircle size={14} />
              <span>Verified</span>
            </div>
          </div>
        </div>

        {/* Today's Schedule Section */}
        <div>
          <div className="schedule-section-header">
            <div className="schedule-title-group">
              <div className="schedule-accent-bar"></div>
              <h3 className="schedule-section-title">Today's Schedule</h3>
            </div>
            <span className="schedule-session-count">
              {schedules.length} session{schedules.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="schedule-timeline-container">
            {schedules.map((session, idx) => {
              const isLive = session.status === 'live';
              const isMarked = session.status === 'marked';
              const isClosed = session.status === 'closed';
              const isUpcoming = session.status === 'upcoming';

              let cardClass = 'session-card';
              if (isLive) cardClass += ' live-card';
              else if (isMarked) cardClass += ' marked-card';
              else if (isClosed) cardClass += ' closed-card';

              return (
                <div key={session.session_key} className="schedule-timeline-row">
                  {/* Left Start Time */}
                  <div className="timeline-time-col">
                    {session.start_time || '21:00'}
                  </div>

                  {/* Timeline Dot */}
                  <div className="timeline-dot-wrapper">
                    <div className={`timeline-dot ${session.status}`}></div>
                  </div>

                  {/* Session Card */}
                  <div className={cardClass}>
                    <div className="session-left-group">
                      {getSessionIcon(session)}
                      
                      <div className="session-info-group">
                        <h4 className="session-name-text">{session.session_name}</h4>
                        <div className="session-time-text">
                          {session.start_time} – {session.end_time}
                        </div>
                        {session.late_time && (
                          <span className="session-late-pill">
                            Late after {session.late_time}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Action / Status Badge */}
                    <div className="session-status-container">
                      {isMarked ? (
                        <span className="status-pill-badge marked">
                          <CheckCircle size={14} /> Marked
                        </span>
                      ) : isLive ? (
                        <button
                          className="mark-attendance-btn"
                          onClick={() => handleOpenMarkModal(session)}
                        >
                          <Fingerprint size={16} /> Mark Attendance
                        </button>
                      ) : isClosed ? (
                        <span className="status-pill-badge closed">
                          Closed
                        </span>
                      ) : (
                        <span className="status-pill-badge upcoming">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Mark Attendance Modal */}
      {markingSession && (
        <div className="modal-overlay">
          <div className="modal-content-box">
            <button 
              className="modal-close-btn"
              onClick={() => {
                if (!isMarking) {
                  setMarkingSession(null);
                  setMarkError('');
                  setMarkSuccess('');
                }
              }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
              {markingSession.session_name} Attendance
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 1.5rem 0' }}>
              {markingSession.start_time} – {markingSession.end_time}
            </p>

            {markSuccess ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: '#ecfdf5',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem auto'
                }}>
                  <CheckCircle size={40} />
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46', margin: '0 0 4px 0' }}>
                  Attendance Verified!
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#047857', margin: 0 }}>
                  {markSuccess}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <RadarAnimation isScanning={isMarking}>
                  <button
                    onClick={() => handleTriggerMarkAttendance(markingSession)}
                    disabled={isMarking}
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isMarking ? 'wait' : 'pointer',
                      boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.5)',
                      transition: 'all 0.2s ease',
                      zIndex: 20
                    }}
                  >
                    <Fingerprint size={48} />
                  </button>
                </RadarAnimation>

                <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                    {isMarking ? 'Scanning for Classroom ESP32...' : 'Tap to Mark Attendance'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                    Ensure Bluetooth is enabled on your device.
                  </div>
                </div>

                {markError && (
                  <div style={{
                    marginTop: '1.25rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: '12px',
                    color: '#b91c1c',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    width: '100%',
                    textAlign: 'center'
                  }}>
                    {markError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unauthorized Device / Browser Modal */}
      {unauthorizedModal.show && createPortal(
        <div className="modal-overlay">
          <div className="modal-content-box" style={{ maxWidth: '400px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto'
            }}>
              <AlertTriangle size={32} />
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991b1b', marginBottom: '0.5rem' }}>
              Access Unauthorized
            </h2>

            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {unauthorizedModal.message || 'You are not authorized. Please login again.'}
            </p>

            <div style={{
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              padding: '0.75rem',
              marginBottom: '1.25rem',
              border: '1px solid #fecaca',
              fontSize: '0.85rem',
              color: '#b91c1c',
              fontWeight: 600,
              width: '100%'
            }}>
              Auto-logging out in <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{unauthorizedModal.countdown}s</span>...
            </div>

            <button
              onClick={() => {
                logout();
                window.location.href = '/login';
              }}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)'
              }}
            >
              Re-login Now
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default StudentDashboard;
