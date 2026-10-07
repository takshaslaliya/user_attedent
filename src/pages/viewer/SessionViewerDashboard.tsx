import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Clock, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Tv, 
  Radio, 
  Users, 
  Layers, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import './SessionViewerDashboard.css';

const formatISTTime = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    let d: Date;
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z') && dateStr.includes(' ')) {
      d = new Date(dateStr.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) {
        d = new Date(dateStr);
      }
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).toUpperCase();
  } catch (e) {
    return '—';
  }
};

export const SessionViewerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [sessionStarted, setSessionStarted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // Assigned sessions from user
  let assignedList: string[] = ['all'];
  if (user?.assigned_sessions) {
    if (Array.isArray(user.assigned_sessions)) {
      assignedList = user.assigned_sessions;
    } else if (typeof user.assigned_sessions === 'string') {
      try {
        assignedList = JSON.parse(user.assigned_sessions);
      } catch (e) {
        assignedList = [user.assigned_sessions];
      }
    }
  }

  const isAllSessions = assignedList.includes('all') || assignedList.length === 0;

  // Initial Load: Fetch allowed sessions
  useEffect(() => {
    fetchAllowedSessions();
  }, []);

  const fetchAllowedSessions = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/students/sessions');
      if (res.data?.success) {
        const rawSessions: any[] = res.data.data || [];
        const filtered = isAllSessions
          ? rawSessions
          : rawSessions.filter(s => 
              assignedList.some(k => String(k).toLowerCase() === String(s.session_key).toLowerCase())
            );

        setSessions(filtered);
        if (filtered.length > 0) {
          setActiveSessionKey(filtered[0].session_key);
        }
      }
    } catch (err) {
      console.error('Failed to load allowed sessions', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll live attendance and schedule whenever activeSessionKey or selectedDate changes
  useEffect(() => {
    if (!activeSessionKey) return;

    fetchLiveAttendance();
    const interval = setInterval(fetchLiveAttendance, 3500);
    return () => clearInterval(interval);
  }, [activeSessionKey, selectedDate]);

  const fetchLiveAttendance = async () => {
    if (!activeSessionKey) return;
    try {
      const [attendRes, schedRes] = await Promise.all([
        apiClient.get(`/attendance/session/${activeSessionKey}/students?date=${selectedDate}`).catch(() => ({ data: { success: false, data: [] } })),
        apiClient.get(`/attendance/schedule?type=${activeSessionKey}`).catch(() => ({ data: { success: false } }))
      ]);

      if (attendRes.data?.success) {
        setAttendanceList(attendRes.data.data || []);
        setSessionStarted(Boolean(attendRes.data.session_started || (attendRes.data.total_present > 0)));
      }

      if (schedRes.data?.success) {
        setScheduleData(schedRes.data.data);
      }
    } catch (err) {
      console.error('Error fetching live attendance for viewer', err);
    }
  };

  const activeSessionObj = sessions.find(s => String(s.session_key).toLowerCase() === activeSessionKey.toLowerCase());

  // Filtered List
  const filteredList = attendanceList.filter(s => {
    const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
    const matchesFloor = floorFilter === 'All' || String(s.floor_id) === floorFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      String(s.student_code || '').toLowerCase().includes(q) ||
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.room_number || '').toLowerCase().includes(q);
    return matchesStatus && matchesFloor && matchesSearch;
  });

  const presentCount = attendanceList.filter(s => s.status === 'Present' || s.status === 'Late').length;

  return (
    <div className="viewer-dashboard-wrapper">
      {/* Top Header */}
      <header className="viewer-top-header">
        <div className="viewer-header-left">
          <div className="viewer-logo-wrap">
            <Tv size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="viewer-title">{user?.name || 'Live Session Monitor'}</h1>
              <span className="viewer-badge">
                Access #{user?.access_number || user?.username || 'Viewer'}
              </span>
            </div>
            <p className="viewer-subtitle">
              Live Attendance Stream • {sessions.length} Allowed Session{sessions.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="viewer-header-right">
          <button onClick={logout} className="viewer-logout-btn">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="viewer-content-container">
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#4f46e5' }} />
            <p style={{ fontSize: '15px', fontWeight: 600 }}>Loading assigned attendance sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <HamsCard padding="40px">
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <AlertCircle size={48} style={{ margin: '0 auto 12px auto', color: '#ef4444' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#1e293b' }}>No Sessions Assigned</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>
                Your access number currently has no active attendance sessions assigned. Please contact the Hostel Admin Office.
              </p>
            </div>
          </HamsCard>
        ) : (
          <>
            {/* Session Tabs */}
            {sessions.length > 1 && (
              <div className="viewer-session-tabs">
                {sessions.map(sess => (
                  <button
                    key={sess.session_key}
                    onClick={() => setActiveSessionKey(sess.session_key)}
                    className={`viewer-session-tab-btn ${activeSessionKey === sess.session_key ? 'active' : ''}`}
                  >
                    <Clock size={16} />
                    {sess.session_name}
                  </button>
                ))}
              </div>
            )}

            {/* Session Live Status Banner */}
            <div className={`viewer-status-banner ${sessionStarted ? 'started' : 'waiting'}`}>
              <div className="viewer-status-left">
                <span className={`viewer-pulse-dot ${sessionStarted ? 'active' : 'idle'}`}></span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                    {activeSessionObj?.session_name || 'Session'} Live Attendance
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                    {sessionStarted 
                      ? `Live Sync Active • ${presentCount} / ${attendanceList.length} Students Checked In` 
                      : `Session Waiting to Start • Scheduled Window: ${scheduleData?.start_time || '—'} to ${scheduleData?.end_time || '—'}`}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '4px 10px', borderRadius: '6px' }}>
                  Auto-syncing every 3s
                </span>
              </div>
            </div>

            {/* Attendance Filters & Table Card */}
            <HamsCard padding="24px">
              {/* Filter Controls */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    outline: 'none',
                    backgroundColor: '#ffffff'
                  }}
                />

                <select
                  value={floorFilter}
                  onChange={e => setFloorFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    outline: 'none',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="All">All Floors</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(f => (
                    <option key={f} value={String(f)}>Floor {f}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    outline: 'none',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="All">All Status</option>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Leave">Leave</option>
                  <option value="Absent">Absent</option>
                </select>

                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search by ID, Name, or Room..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ fontSize: '13px', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                  Live Sync ({filteredList.length})
                </div>
              </div>

              {/* Attendance Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '12px 14px' }}>Code</th>
                      <th style={{ padding: '12px 14px' }}>Student Name</th>
                      <th style={{ padding: '12px 14px' }}>Floor / Room</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={14} color="#64748b" /> Time (IST)
                        </div>
                      </th>
                      <th style={{ padding: '12px 14px' }}>Notes / Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map(s => (
                      <tr key={s.student_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: '#3b82f6', fontFamily: 'monospace' }}>
                          {s.student_code}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>{s.name}</span>
                            {s.tags && s.tags.length > 0 && s.tags.map((tag: any) => (
                              <span
                                key={tag.id || tag.tag_id}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  backgroundColor: `${tag.color || '#4f46e5'}20`,
                                  color: tag.color || '#4f46e5',
                                  border: `1px solid ${tag.color || '#4f46e5'}50`
                                }}
                              >
                                🏷️ {tag.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '13px' }}>
                          Floor {s.floor_id} {s.room_number ? `(Rm ${s.room_number})` : ''}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: s.status === 'Present' ? '#ecfdf5' : (s.status === 'Late' ? '#fef3c7' : (s.status === 'Leave' ? '#ede9fe' : '#fef2f2')),
                            color: s.status === 'Present' ? '#166534' : (s.status === 'Late' ? '#92400e' : (s.status === 'Leave' ? '#6d28d9' : '#991b1b')),
                            border: s.status === 'Leave' ? '1px solid #ddd6fe' : undefined,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {s.status === 'Leave' ? '🏖️ Leave' : s.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          {s.marked_at && (s.status === 'Present' || s.status === 'Late') ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#1e293b',
                              backgroundColor: '#f8fafc',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0'
                            }}>
                              <Clock size={12} color="#64748b" />
                              {formatISTTime(s.marked_at)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '13px', maxWidth: '240px' }}>
                          {s.remarks || s.reason || '—'}
                        </td>
                      </tr>
                    ))}
                    {filteredList.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                          No attendance records found matching criteria for {selectedDate}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </HamsCard>
          </>
        )}
      </div>
    </div>
  );
};
