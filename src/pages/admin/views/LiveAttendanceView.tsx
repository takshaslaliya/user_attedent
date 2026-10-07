import React, { useEffect, useState } from 'react';
import { 
  Edit2, 
  Trash2, 
  Clock, 
  ArrowRight, 
  Info, 
  ChevronDown, 
  Play, 
  Square, 
  Download, 
  CheckCircle, 
  XCircle, 
  Search, 
  UserCheck 
} from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './LiveAttendanceView.css';

interface LiveAttendanceViewProps {
  sessionKey: string;
  sessionName: string;
  onChanged?: () => void;
}

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

export const LiveAttendanceView: React.FC<LiveAttendanceViewProps> = ({ sessionKey, sessionName, onChanged }) => {
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('21:30');
  const [lateTime, setLateTime] = useState<string | null>(null);
  const [linkedSessionKey, setLinkedSessionKey] = useState<string | null>(null);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Default to Tab 1 (View Attendance) so today's live attendance is immediately visible
  const [activeTab, setActiveTab] = useState(1);
  
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStudents, setAttendanceStudents] = useState<any[]>([]);
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [absentDate, setAbsentDate] = useState(new Date().toISOString().split('T')[0]);
  const [justificationModal, setJustificationModal] = useState<{isOpen: boolean, studentId: string, currentReason: string} | null>(null);

  useEffect(() => {
    fetchSchedule();
  }, [sessionKey]);

  // Live polling for live attendance
  useEffect(() => {
    if (activeTab === 1) {
      fetchAttendance();
      const interval = setInterval(fetchAttendance, 4000);
      return () => clearInterval(interval);
    } else if (activeTab === 2) {
      fetchAbsent();
    }
  }, [activeTab, attendanceDate, absentDate, sessionKey]);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/attendance/schedule?type=${sessionKey}`);
      if (res.data.success) {
        setStartTime(res.data.data.start_time);
        setEndTime(res.data.data.end_time);
        setLateTime(res.data.data.late_time || null);
        setLinkedSessionKey(res.data.data.linked_session_key || null);
      }
      
      const sessionsRes = await apiClient.get('/admin/sessions');
      if (sessionsRes.data.success) {
        setAvailableSessions(sessionsRes.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch schedule', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/attendance/schedule', {
        startTime,
        endTime,
        type: sessionKey,
        lateTime,
        linkedSessionKey
      });
      if (res.data.success) {
        alert('Schedule saved successfully');
      }
    } catch (err) {
      alert('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const stopAttendance = async () => {
    setSaving(true);
    try {
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const res = await apiClient.put('/attendance/schedule', {
        startTime: nowStr,
        endTime: nowStr,
        type: sessionKey,
      });

      if (res.data.success) {
        setStartTime(nowStr);
        setEndTime(nowStr);
        alert('Attendance stopped immediately.');
      }
    } catch (err) {
      alert('Failed to stop attendance');
    } finally {
      setSaving(false);
    }
  };

  const editSession = async () => {
    const newName = window.prompt('Edit Session Name:', sessionName);
    if (newName && newName.trim() !== '') {
      setLoading(true);
      try {
        const res = await apiClient.put(`/admin/sessions/${sessionKey}`, {
          session_name: newName.trim()
        });
        if (res.data.success && onChanged) {
          onChanged();
        }
      } catch (err) {
        alert('Failed to edit session');
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteSession = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${sessionName} session?`)) return;
    setLoading(true);
    try {
      const res = await apiClient.delete(`/admin/sessions/${sessionKey}`);
      if (res.data.success && onChanged) {
        onChanged();
      }
    } catch (err) {
      alert('Failed to delete session');
    } finally {
      setLoading(false);
    }
  };

  const exportAttendance = () => {
    const token = localStorage.getItem('token');
    const baseUrl = apiClient.defaults.baseURL || '/api';
    window.open(`${baseUrl}/attendance/export?type=${sessionKey}&date=${attendanceDate}&token=${token}`, '_blank');
  };

  const isAttendanceOpen = () => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [sh, sm] = startTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    
    const [eh, em] = endTime.split(':').map(Number);
    const endMins = eh * 60 + em;

    if (startMins === endMins) return false;

    if (endMins < startMins) {
      return nowMinutes >= startMins || nowMinutes <= endMins;
    } else {
      return nowMinutes >= startMins && nowMinutes <= endMins;
    }
  };

  const fetchAttendance = async () => {
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/students?date=${attendanceDate}`);
      if (res.data.success) {
        setAttendanceStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markManual = async (studentId: string) => {
    try {
      await apiClient.post('/attendance/mark-manual', {
        session_key: sessionKey,
        student_code: studentId,
        date: attendanceDate
      });
      alert('Marked manually');
      fetchAttendance();
    } catch (e) {
      alert('Failed to mark manually');
    }
  };

  const fetchAbsent = async () => {
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/absent-reasons?date=${absentDate}`);
      if (res.data.success) {
        setAbsentStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const justifyAbsence = async (studentId: string, reason: string) => {
    try {
      await apiClient.post(`/attendance/session/absent-reason`, {
        session_key: sessionKey,
        student_code: studentId,
        date: absentDate,
        reason: reason
      });
      alert('Reason saved');
      setJustificationModal(null);
      fetchAbsent();
    } catch (e) {
      alert('Failed to save reason');
    }
  };

  const formatTime = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  // Filter attendance list
  const filteredAttendance = attendanceStudents.filter(s => {
    const matchesStatus = attendanceStatusFilter === 'All' || s.status === attendanceStatusFilter;
    const matchesFloor = floorFilter === 'All' || String(s.floor_id) === floorFilter;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      String(s.student_code || '').toLowerCase().includes(query) ||
      String(s.name || '').toLowerCase().includes(query) ||
      String(s.room_number || '').toLowerCase().includes(query);
    return matchesStatus && matchesFloor && matchesSearch;
  });

  if (loading && attendanceStudents.length === 0) {
    return <div className="loading-state">Loading live attendance...</div>;
  }

  const isOpen = isAttendanceOpen();

  return (
    <div className="live-view-container">
      <div className="live-header">
        <div>
          <h2>{sessionName} Schedule</h2>
          <p>Set time window and view live attendance for this session.</p>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={editSession} title="Edit Name"><Edit2 size={20} /></button>
          <button className="icon-btn delete" onClick={deleteSession} title="Delete"><Trash2 size={20} /></button>
        </div>
      </div>

      <div className="tabs-header" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <button className={`tab-btn ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>View Attendance</button>
        <button className={`tab-btn ${activeTab === 0 ? 'active' : ''}`} onClick={() => setActiveTab(0)}>Set Timing</button>
        <button className={`tab-btn ${activeTab === 2 ? 'active' : ''}`} onClick={() => setActiveTab(2)}>Report Verification</button>
      </div>

      {activeTab === 0 && (
        <>
          <div className={`status-banner ${isOpen ? 'open' : 'closed'}`}>
            <div className="status-icon">
              {isOpen ? <CheckCircle size={24} /> : <XCircle size={24} />}
            </div>
            <div className="status-text">
              <h3>Attendance is {isOpen ? 'OPEN' : 'CLOSED'}</h3>
              {isOpen && <p>Window: {formatTime(startTime)} – {formatTime(endTime)}</p>}
            </div>
          </div>

          <HamsCard padding="32px" className="schedule-card">
            <div className="card-section-header">
              <div className="icon-wrap"><Clock size={20} /></div>
              <h3>Global Time Window</h3>
            </div>

            <div className="time-pickers-row">
              <div className="time-field">
                <label>Start Time</label>
                <div className="input-wrap">
                  <input 
                    type="time" 
                    value={startTime} 
                    onChange={e => setStartTime(e.target.value)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker && (e.target as HTMLInputElement).showPicker()}
                  />
                </div>
              </div>
              <ArrowRight className="arrow-icon" size={24} />
              <div className="time-field">
                <label>End Time</label>
                <div className="input-wrap">
                  <input 
                    type="time" 
                    value={endTime} 
                    onChange={e => setEndTime(e.target.value)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker && (e.target as HTMLInputElement).showPicker()}
                  />
                </div>
              </div>
            </div>

            <h3 className="advanced-title">Advanced Settings</h3>
            <div className="advanced-row">
              <div className="time-field">
                <label>Late Criteria Time</label>
                <div className="input-wrap">
                  <input type="time" value={lateTime || ''} onChange={e => setLateTime(e.target.value)} />
                </div>
                {lateTime && (
                  <div className="clear-info">
                    <Info size={14} /> Clear late time to disable late criteria limit.
                    <button onClick={() => setLateTime(null)}>Clear</button>
                  </div>
                )}
              </div>
              <div className="time-field">
                <label>Linked Attendance (Auto-mark)</label>
                <div className="input-wrap select-wrap">
                  <select value={linkedSessionKey || ''} onChange={e => setLinkedSessionKey(e.target.value || null)}>
                    <option value="">None</option>
                    {availableSessions.filter(s => s.session_key !== sessionKey).map(s => (
                      <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="select-arrow" />
                </div>
              </div>
            </div>

            <div className="action-buttons">
              <button className="btn-primary start" onClick={saveSchedule} disabled={saving}>
                <Play size={18} /> {saving ? 'Saving...' : 'Start / Save Attendance'}
              </button>
              <button className="btn-primary stop" onClick={stopAttendance} disabled={saving}>
                <Square size={18} /> Stop Immediately
              </button>
            </div>

            <button className="btn-outline export" onClick={exportAttendance}>
              <Download size={18} /> Export Today's Attendance (CSV)
            </button>
          </HamsCard>
        </>
      )}

      {activeTab === 1 && (
         <HamsCard padding="24px">
           <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center'}}>
             <input type="date" className="filter-select" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} style={{ width: '150px' }} />
             
             <select className="filter-select" value={floorFilter} onChange={e => setFloorFilter(e.target.value)} style={{ width: '130px' }}>
               <option value="All">All Floors</option>
               {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => (
                 <option key={fl} value={String(fl)}>Floor {fl}</option>
               ))}
             </select>

             <select className="filter-select" value={attendanceStatusFilter} onChange={e => setAttendanceStatusFilter(e.target.value)} style={{ width: '130px' }}>
               <option value="All">All Status</option>
               <option value="Present">Present</option>
               <option value="Late">Late</option>
               <option value="Absent">Absent</option>
               <option value="Leave">Leave</option>
             </select>

             <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
               <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
               <input 
                 type="text" 
                 placeholder="Search by ID, Name, or Room..."
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 style={{ width: '100%', paddingLeft: '36px', height: '40px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text)', boxSizing: 'border-box' }}
               />
             </div>

             <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
               <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
               Live Sync ({filteredAttendance.length})
             </span>
           </div>
           
           <div style={{ overflowX: 'auto' }}>
             <table className="students-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: '#64748b' }}>
                    <th style={{ padding: '12px' }}>Code</th>
                    <th style={{ padding: '12px' }}>Name</th>
                    <th style={{ padding: '12px' }}>Floor / Room</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} color="#64748b" /> Time (IST)
                      </div>
                    </th>
                    <th style={{ padding: '12px' }}>Notes / Remarks</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map(s => (
                    <tr key={s.student_code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#3b82f6' }}>{s.student_code}</td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>
                        Floor {s.floor_id} {s.room_number ? `(Rm ${s.room_number})` : ''}
                      </td>
                      <td style={{ padding: '12px' }}>
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
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {s.marked_at && (s.status === 'Present' || s.status === 'Late') ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '12px',
                            fontWeight: 600,
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
                      <td style={{ padding: '12px', color: '#64748b', fontSize: '13px', maxWidth: '200px' }}>
                        {s.remarks || s.reason || '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {s.status !== 'Present' ? (
                          <button 
                            className="action-btn" 
                            onClick={() => markManual(s.student_code)}
                            style={{
                              padding: '5px 12px',
                              backgroundColor: '#e0e7ff',
                              color: '#4338ca',
                              border: '1px solid #c7d2fe',
                              borderRadius: '6px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <UserCheck size={13} /> Mark Manual
                          </button>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 600, fontSize: '12px' }}>✓ Marked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAttendance.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No students match the selected criteria for {attendanceDate}.</td></tr>
                  )}
                </tbody>
             </table>
           </div>
         </HamsCard>
      )}

      {activeTab === 2 && (
         <HamsCard padding="24px">
           <div style={{marginBottom: '24px'}}>
             <input type="date" className="filter-select" value={absentDate} onChange={e => setAbsentDate(e.target.value)} />
           </div>
           
           <table className="students-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px' }}>Code</th>
                  <th style={{ padding: '12px' }}>Name</th>
                  <th style={{ padding: '12px' }}>Reason</th>
                  <th style={{ padding: '12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {absentStudents.map(s => (
                  <tr key={s.student_code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px' }}>{s.student_code}</td>
                    <td style={{ padding: '12px' }}>{s.name}</td>
                    <td style={{ padding: '12px' }}>{s.reason || 'None'}</td>
                    <td style={{ padding: '12px' }}>
                      <button className="action-btn" onClick={() => setJustificationModal({isOpen: true, studentId: s.student_code, currentReason: s.reason || ''})}>Justify</button>
                    </td>
                  </tr>
                ))}
                {absentStudents.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center' }}>No absent students found.</td></tr>
                )}
              </tbody>
           </table>
         </HamsCard>
      )}

      {justificationModal?.isOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <h3 style={{ margin: '0 0 10px' }}>Justify Absence</h3>
            <textarea 
               style={{ width: '100%', height: '80px', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text)' }}
               value={justificationModal.currentReason} 
               onChange={e => setJustificationModal({...justificationModal, currentReason: e.target.value})} 
               placeholder="Enter reason..."
            />
            <div className="custom-modal-actions" style={{ marginTop: '15px' }}>
              <button className="btn-cancel" onClick={() => setJustificationModal(null)}>Cancel</button>
              <button className="btn-save" onClick={() => justifyAbsence(justificationModal.studentId, justificationModal.currentReason)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
