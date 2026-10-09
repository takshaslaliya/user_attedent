import React, { useEffect, useState, useMemo } from 'react';
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
  Clock,
  Radio,
  Building,
  DoorClosed,
  ChevronRight,
  ClipboardList,
  FileText,
  BarChart2,
  Check,
  Send,
  Star
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

interface StudentFormItem {
  id: number;
  title: string;
  description?: string;
  form_type: 'poll' | 'form';
  fields: Array<{
    id: string;
    label: string;
    type: 'radio' | 'checkbox' | 'boolean' | 'text' | 'textarea' | 'rating';
    options?: string[];
    required?: boolean;
  }>;
  start_time: string;
  end_time: string;
  is_mandatory: boolean;
  has_viewed: boolean;
  has_submitted: boolean;
  my_response?: {
    submitted_at: string;
    answers: Record<string, any>;
  };
}

export const StudentDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [activeForms, setActiveForms] = useState<StudentFormItem[]>([]);
  const [selectedForm, setSelectedForm] = useState<StudentFormItem | null>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({});
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formSubmitSuccess, setFormSubmitSuccess] = useState('');
  const [formSubmitError, setFormSubmitError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingSession, setMarkingSession] = useState<ScheduleItem | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState('');
  const [markSuccess, setMarkSuccess] = useState('');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [unauthorizedModal, setUnauthorizedModal] = useState<{
    show: boolean;
    message: string;
    countdown: number;
  }>({
    show: false,
    message: '',
    countdown: 3
  });

  // Live ticking clock
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

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

      // Fetch active forms for the logged-in student
      try {
        const formsRes = await apiClient.get('/forms/student/active');
        if (formsRes.data && formsRes.data.status === 'success') {
          setActiveForms(formsRes.data.data || []);
        }
      } catch (fErr) {
        console.error('Failed to load active forms', fErr);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenFormModal = async (form: StudentFormItem) => {
    setSelectedForm(form);
    setFormSubmitSuccess('');
    setFormSubmitError('');

    // Pre-populate if already submitted or initialize defaults
    if (form.has_submitted && form.my_response?.answers) {
      setFormAnswers(form.my_response.answers);
    } else {
      const initial: Record<string, any> = {};
      form.fields.forEach(f => {
        if (f.type === 'checkbox') initial[f.id] = [];
        else if (f.type === 'boolean') initial[f.id] = null;
        else if (f.type === 'rating') initial[f.id] = 0;
        else initial[f.id] = '';
      });
      setFormAnswers(initial);
    }

    // Immediately record view to backend (seen_not_answered tracking)
    try {
      await apiClient.post(`/forms/${form.id}/view`);
      // Update local state to viewed
      setActiveForms(prev => prev.map(f => f.id === form.id ? { ...f, has_viewed: true } : f));
    } catch (viewErr) {
      console.error('Failed to log form view', viewErr);
    }
  };

  const handleAnswerChange = (fieldId: string, value: any) => {
    setFormAnswers(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleCheckboxToggle = (fieldId: string, option: string) => {
    setFormAnswers(prev => {
      const currentList: string[] = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      if (currentList.includes(option)) {
        return { ...prev, [fieldId]: currentList.filter(o => o !== option) };
      } else {
        return { ...prev, [fieldId]: [...currentList, option] };
      }
    });
  };

  const handleSubmitFormResponse = async () => {
    if (!selectedForm) return;
    setFormSubmitError('');
    setFormSubmitSuccess('');

    // Validation for required fields
    for (const field of selectedForm.fields) {
      if (field.required) {
        const val = formAnswers[field.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          setFormSubmitError(`Please fill in required question: "${field.label}"`);
          return;
        }
      }
    }

    setIsSubmittingForm(true);
    try {
      const res = await apiClient.post(`/forms/${selectedForm.id}/submit`, {
        answers: formAnswers
      });
      if (res.data.status === 'success') {
        setFormSubmitSuccess('Your response has been successfully recorded!');
        // Update local state
        setActiveForms(prev => prev.map(f => f.id === selectedForm.id ? { 
          ...f, 
          has_submitted: true, 
          my_response: { submitted_at: new Date().toISOString(), answers: formAnswers } 
        } : f));
        
        setTimeout(() => {
          setSelectedForm(null);
          setFormSubmitSuccess('');
        }, 1600);
      } else {
        throw new Error(res.data.message || 'Failed to submit response');
      }
    } catch (err: any) {
      setFormSubmitError(err.response?.data?.message || err.message || 'Failed to submit form');
    } finally {
      setIsSubmittingForm(false);
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
  const formattedDate = useMemo(() => {
    try {
      return currentTime.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Kolkata'
      }).toUpperCase();
    } catch (e) {
      return 'TODAY';
    }
  }, [currentTime]);

  const formattedTime = useMemo(() => {
    try {
      return currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
    } catch (e) {
      return '';
    }
  }, [currentTime]);

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

  const activeLiveSession = useMemo(() => {
    return schedules.find(s => s.status === 'live');
  }, [schedules]);

  const displayName = studentProfile?.name || user?.name || 'Student';
  const displayId = studentProfile?.student_code || studentProfile?.id || '';
  const displayRoom = studentProfile?.room || user?.room || '913';
  const displayFloor = studentProfile?.floor_id !== undefined && studentProfile?.floor_id !== null ? studentProfile?.floor_id : (user?.floor_id || '9');
  const displayPhone = studentProfile?.phone || user?.phone || '9725714912';

  return (
    <div className="student-dashboard-root">
      
      {/* Ambient background glow layers for laptop & mobile */}
      <div className="ambient-glow glow-top-left"></div>
      <div className="ambient-glow glow-top-right"></div>
      
      <div className="student-dashboard-container">
        
        {/* Top Header */}
        <header className="student-header">
          <div className="student-header-left">
            <div className="student-date-badge">
              <Calendar size={13} className="date-badge-icon" />
              <span>{formattedDate}</span>
              <span className="live-clock-pill">
                <Clock size={11} /> {formattedTime}
              </span>
            </div>
            <h1 className="student-header-title">Attendance</h1>
            <p className="student-header-subtitle">Daily verification & routine schedule</p>
          </div>
          
          <div className="student-header-actions">
            <button 
              className={`student-icon-btn ${isRefreshing ? 'is-loading' : ''}`}
              onClick={fetchStatus} 
              title="Refresh Schedule"
            >
              <RotateCw size={17} className={isRefreshing ? 'spin-animation' : ''} />
            </button>
            <button 
              className="student-icon-btn logout-btn" 
              onClick={logout} 
              title="Logout"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Live Active Banner if a session is currently open */}
        {activeLiveSession && (
          <div className="active-session-banner">
            <div className="active-banner-left">
              <span className="live-pulse-dot"></span>
              <div>
                <div className="active-banner-label">SESSION LIVE NOW</div>
                <div className="active-banner-title">{activeLiveSession.session_name} ({activeLiveSession.start_time} - {activeLiveSession.end_time})</div>
              </div>
            </div>
            <button 
              className="active-banner-cta"
              onClick={() => handleOpenMarkModal(activeLiveSession)}
            >
              <Fingerprint size={16} /> Mark Now
            </button>
          </div>
        )}

        {/* Student Profile Card */}
        <div className="student-profile-card">
          <div className="profile-top-row">
            <div className="profile-avatar-circle">
              {getInitials(displayName)}
            </div>
            
            <div className="profile-main-info">
              <div className="profile-name-row">
                <h2 className="profile-student-name">{displayName}</h2>
                <div className="verified-pill">
                  <CheckCircle size={13} />
                  <span>Verified</span>
                </div>
              </div>
              
              <div className="profile-badges-row">
                {displayId && (
                  <span className="pill-badge id-badge">
                    🪪 ID: {displayId}
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
              <Phone size={13} color="#64748b" />
              <span>{displayPhone}</span>
            </div>

            <div className="profile-status-indicator">
              <span className="device-status-dot"></span>
              <span>BLE Scanner Active</span>
            </div>
          </div>
        </div>

        {/* Active Polls & Feedback Forms Section */}
        {activeForms.length > 0 && (
          <div className="forms-section-wrapper">
            <div className="schedule-section-header">
              <div className="schedule-title-group">
                <div className="schedule-accent-bar" style={{ background: 'linear-gradient(to bottom, #3b82f6, #8b5cf6)' }}></div>
                <h3 className="schedule-section-title">Active Polls & Forms</h3>
              </div>
              <span className="schedule-session-count" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                {activeForms.length} Active
              </span>
            </div>

            <div className="forms-list-container">
              {activeForms.map((form) => {
                const isMandatory = form.is_mandatory;
                const isPoll = form.form_type === 'poll';
                const hasSubmitted = form.has_submitted;

                return (
                  <div 
                    key={`form_${form.id}`} 
                    className={`form-student-card ${isMandatory ? 'mandatory' : ''} ${isPoll ? 'poll-type' : ''}`}
                    onClick={() => handleOpenFormModal(form)}
                  >
                    <div className="form-card-left">
                      <div className={`form-icon-pill ${isPoll ? 'poll' : 'form'}`}>
                        {isPoll ? <BarChart2 size={22} /> : <ClipboardList size={22} />}
                      </div>

                      <div>
                        <div className="form-info-title">{form.title}</div>
                        <div className="form-meta-row">
                          {isMandatory && <span className="mandatory-tag">Required</span>}
                          <span>{isPoll ? '📊 Quick Poll' : '📝 Multi-field Form'}</span>
                          <span>• Closes: {new Date(form.end_time).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {hasSubmitted ? (
                        <button className="form-status-btn submitted-btn" onClick={(e) => { e.stopPropagation(); handleOpenFormModal(form); }}>
                          <CheckCircle size={15} /> Submitted
                        </button>
                      ) : (
                        <button className="form-status-btn fill-btn" onClick={(e) => { e.stopPropagation(); handleOpenFormModal(form); }}>
                          {isPoll ? 'Vote Now' : 'Fill Form'} <ChevronRight size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today's Schedule Section */}
        <div className="schedule-section-wrapper">
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
            {schedules.length === 0 ? (
              <div className="no-schedules-card">
                <Radio size={32} className="no-schedules-icon" />
                <p className="no-schedules-title">No Active Sessions Scheduled</p>
                <p className="no-schedules-subtitle">Sessions for today will appear here as soon as scheduled by supervisor.</p>
              </div>
            ) : (
              schedules.map((session) => {
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
                      <span className="time-primary">{session.start_time || '21:00'}</span>
                      <span className="time-secondary">{session.end_time || '21:30'}</span>
                    </div>

                    {/* Timeline Connector & Dot */}
                    <div className="timeline-dot-wrapper">
                      <div className="timeline-line"></div>
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
              })
            )}
          </div>
        </div>

      </div>

      {/* Form / Poll Filler Modal */}
      {selectedForm && (
        <div className="modal-overlay" onClick={() => setSelectedForm(null)}>
          <div className="form-modal-box" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-btn"
              onClick={() => setSelectedForm(null)}
            >
              <X size={18} />
            </button>

            <div className="form-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className={`pill-badge ${selectedForm.form_type === 'poll' ? 'poll' : 'form'}`} style={{ background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                  {selectedForm.form_type === 'poll' ? '📊 Poll' : '📝 Feedback Form'}
                </span>
                {selectedForm.is_mandatory && (
                  <span className="mandatory-tag">Mandatory</span>
                )}
                {selectedForm.has_submitted && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px' }}>
                    ✓ Already Submitted
                  </span>
                )}
              </div>
              <h3 className="form-modal-title">{selectedForm.title}</h3>
              {selectedForm.description && (
                <p className="form-modal-desc">{selectedForm.description}</p>
              )}
            </div>

            {formSubmitSuccess ? (
              <div className="modal-success-box" style={{ padding: '2rem 1rem' }}>
                <div className="modal-success-icon-wrap">
                  <CheckCircle size={44} />
                </div>
                <h4 className="modal-success-title">Thank You!</h4>
                <p className="modal-success-msg">{formSubmitSuccess}</p>
              </div>
            ) : (
              <div>
                <div className="form-questions-list">
                  {selectedForm.fields.map((field, idx) => {
                    const currentVal = formAnswers[field.id];
                    const isReadOnly = selectedForm.has_submitted;

                    return (
                      <div key={field.id} className="form-question-card">
                        <label className="form-question-label">
                          <span>
                            <strong style={{ marginRight: '6px' }}>Q{idx + 1}.</strong>
                            {field.label}
                            {field.required && <span className="required-asterisk">*</span>}
                          </span>
                        </label>

                        {/* Radio / Single Choice */}
                        {field.type === 'radio' && (
                          <div className="form-options-group">
                            {(field.options || []).map((opt) => (
                              <label 
                                key={opt} 
                                className={`choice-option-row ${currentVal === opt ? 'selected' : ''}`}
                              >
                                <input 
                                  type="radio" 
                                  name={`field_${field.id}`} 
                                  value={opt} 
                                  checked={currentVal === opt}
                                  disabled={isReadOnly}
                                  onChange={() => handleAnswerChange(field.id, opt)}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Checkboxes / Multiple Choice */}
                        {field.type === 'checkbox' && (
                          <div className="form-options-group">
                            {(field.options || []).map((opt) => {
                              const isChecked = Array.isArray(currentVal) && currentVal.includes(opt);
                              return (
                                <label 
                                  key={opt} 
                                  className={`choice-option-row ${isChecked ? 'selected' : ''}`}
                                >
                                  <input 
                                    type="checkbox" 
                                    name={`field_${field.id}_${opt}`} 
                                    value={opt} 
                                    checked={isChecked}
                                    disabled={isReadOnly}
                                    onChange={() => handleCheckboxToggle(field.id, opt)}
                                  />
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* True / False Boolean */}
                        {field.type === 'boolean' && (
                          <div className="boolean-toggle-group">
                            <button
                              type="button"
                              disabled={isReadOnly}
                              className={`bool-btn true-btn ${currentVal === true ? 'active' : ''}`}
                              onClick={() => handleAnswerChange(field.id, true)}
                            >
                              ✓ True / Yes
                            </button>
                            <button
                              type="button"
                              disabled={isReadOnly}
                              className={`bool-btn false-btn ${currentVal === false ? 'active' : ''}`}
                              onClick={() => handleAnswerChange(field.id, false)}
                            >
                              ✕ False / No
                            </button>
                          </div>
                        )}

                        {/* Star Rating (1-5) */}
                        {field.type === 'rating' && (
                          <div className="rating-stars-container">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                disabled={isReadOnly}
                                className="star-btn"
                                onClick={() => handleAnswerChange(field.id, star)}
                              >
                                <Star 
                                  size={30} 
                                  fill={(currentVal || 0) >= star ? '#f59e0b' : 'none'} 
                                  color={(currentVal || 0) >= star ? '#f59e0b' : '#cbd5e1'} 
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Short Text */}
                        {field.type === 'text' && (
                          <input 
                            type="text" 
                            className="form-text-input"
                            placeholder="Type your response..."
                            value={currentVal || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                          />
                        )}

                        {/* Textarea */}
                        {field.type === 'textarea' && (
                          <textarea 
                            rows={3}
                            className="form-textarea-input"
                            placeholder="Type your detailed response..."
                            value={currentVal || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {formSubmitError && (
                  <div className="modal-error-badge" style={{ marginBottom: '1rem' }}>
                    <AlertTriangle size={15} />
                    <span>{formSubmitError}</span>
                  </div>
                )}

                <div className="form-modal-actions">
                  <button 
                    type="button" 
                    className="modal-close-btn" 
                    style={{ position: 'static', padding: '0.75rem 1.25rem', borderRadius: '12px', background: '#f1f5f9' }}
                    onClick={() => setSelectedForm(null)}
                  >
                    {selectedForm.has_submitted ? 'Close' : 'Cancel'}
                  </button>
                  {!selectedForm.has_submitted && (
                    <button 
                      type="button" 
                      className="form-submit-btn"
                      disabled={isSubmittingForm}
                      onClick={handleSubmitFormResponse}
                    >
                      {isSubmittingForm ? 'Submitting...' : 'Submit Answers'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

            <div className="modal-header-icon-box">
              <Fingerprint size={28} />
            </div>

            <h3 className="modal-title">
              {markingSession.session_name} Attendance
            </h3>
            <p className="modal-subtitle">
              Session window: {markingSession.start_time} – {markingSession.end_time}
            </p>

            {markSuccess ? (
              <div className="modal-success-box">
                <div className="modal-success-icon-wrap">
                  <CheckCircle size={44} />
                </div>
                <h4 className="modal-success-title">
                  Attendance Verified!
                </h4>
                <p className="modal-success-msg">
                  {markSuccess}
                </p>
              </div>
            ) : (
              <div className="modal-radar-wrapper">
                <RadarAnimation isScanning={isMarking}>
                  <button
                    onClick={() => handleTriggerMarkAttendance(markingSession)}
                    disabled={isMarking}
                    className="modal-fingerprint-btn"
                  >
                    <Fingerprint size={48} />
                  </button>
                </RadarAnimation>

                <div className="modal-scan-text-wrap">
                  <div className="modal-scan-status">
                    {isMarking ? 'Scanning for Classroom ESP32...' : 'Tap to Mark Attendance'}
                  </div>
                  <div className="modal-scan-hint">
                    Ensure Bluetooth & Location are enabled on your device.
                  </div>
                </div>

                {markError && (
                  <div className="modal-error-badge">
                    <AlertTriangle size={15} />
                    <span>{markError}</span>
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
          <div className="modal-content-box unauthorized-box">
            <div className="unauthorized-icon-wrap">
              <AlertTriangle size={34} />
            </div>

            <h2 className="unauthorized-title">
              Access Unauthorized
            </h2>

            <p className="unauthorized-desc">
              {unauthorizedModal.message || 'You are not authorized. Please login again.'}
            </p>

            <div className="unauthorized-countdown">
              Auto-logging out in <span className="countdown-bold">{unauthorizedModal.countdown}s</span>...
            </div>

            <button
              onClick={() => {
                logout();
                window.location.href = '/login';
              }}
              className="unauthorized-relogin-btn"
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
