import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  CalendarCheck,
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
  Star,
  Vote,
  KeyRound,
  ShieldCheck,
  Lock
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

interface AttendancePhaseWindowInfo {
  start_time: string;
  end_time: string;
  late_time?: string | null;
  is_open_now?: boolean;
  is_marked?: boolean;
  marked_at?: string | null;
  is_late?: boolean;
  is_eligible?: boolean;
  status: string;
}

interface ScheduleItem {
  session_key: string;
  session_name: string;
  icon_name?: string;
  is_for_all_students?: boolean;
  start_time: string;
  end_time: string;
  late_time?: string | null;
  has_multiple_attendance?: boolean;
  phase2_start_time?: string | null;
  phase2_end_time?: string | null;
  phase2_late_time?: string | null;
  active_phase?: 1 | 2 | null;
  first_attendance?: AttendancePhaseWindowInfo;
  second_attendance?: AttendancePhaseWindowInfo;
  overall_status?: string;
  status: 'marked' | 'live' | 'closed' | 'upcoming' | 'leave';
  is_marked?: boolean;
  is_present?: boolean;
  is_absent?: boolean;
  is_on_leave?: boolean;
  leave_info?: any;
  is_live?: boolean;
  can_mark?: boolean;
  show_mark_button?: boolean;
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

interface OneDayStudentSession {
  id: number;
  title: string;
  description?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  late_time?: string | null;
  marking_method: 'one_tap' | 'passcode';
  status: string;
  has_marked: boolean;
  marked_at?: string | null;
  marked_time?: string | null;
  student_status?: 'present' | 'late' | 'absent';
  is_late: boolean;
  is_date_today: boolean;
  is_live_now: boolean;
  is_upcoming: boolean;
  is_expired: boolean;
  can_mark: boolean;
  time_status_text: string;
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
  const [locallyMarkedSessions, setLocallyMarkedSessions] = useState<Set<string>>(new Set());

  // One-Day Attendance state
  const [oneDaySessions, setOneDaySessions] = useState<OneDayStudentSession[]>([]);
  const [selectedOneDaySession, setSelectedOneDaySession] = useState<OneDayStudentSession | null>(null);
  const [isMarkingOneDay, setIsMarkingOneDay] = useState(false);
  const [oneDayMarkError, setOneDayMarkError] = useState('');
  const [oneDayMarkSuccess, setOneDayMarkSuccess] = useState('');

  const markSessionLocally = (key: string) => {
    if (!key) return;
    setLocallyMarkedSessions(prev => new Set(prev).add(key));
  };

  const unmarkSessionLocally = (key: string) => {
    if (!key) return;
    setLocallyMarkedSessions(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  useEffect(() => {
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('hams_marked_')) localStorage.removeItem(k);
      });
    } catch (e) { }
  }, []);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Track auto-popup so it triggers once per dashboard visit for unsubmitted forms
  const hasAutoPoppedRef = useRef(false);

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
      let response: any = null;
      try {
        response = await apiClient.get('/attendance/today-sessions');
      } catch (tsErr) {
        response = await apiClient.get('/attendance/my-status');
      }
      if (response?.data && (response.data.success || response.data.status === 'ok')) {
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

        const rawSchedules = payload.sessions || payload.all_schedules || [];
        if (Array.isArray(rawSchedules)) {
          const validSchedules = rawSchedules.filter((s: ScheduleItem) => {
            if (s.is_active_today === false) return false;
            if (s.start_time === '00:00' && s.end_time === '00:00') return false;
            if (s.start_time === s.end_time) return false;
            return true;
          }).map((s: ScheduleItem) => {
            if (s.has_multiple_attendance) {
              const isBothMarked = Boolean(s.first_attendance?.is_marked && s.second_attendance?.is_marked);
              const isOnLeave = Boolean(s.status === 'leave' || s.is_on_leave);
              if (isBothMarked) {
                markSessionLocally(s.session_key);
              } else {
                unmarkSessionLocally(s.session_key);
              }
              return {
                ...s,
                is_marked: isBothMarked,
                is_present: isBothMarked,
                is_on_leave: isOnLeave,
                can_mark: Boolean(s.can_mark),
                show_mark_button: Boolean(s.show_mark_button),
                status: isBothMarked ? ('marked' as const) : (isOnLeave ? ('leave' as const) : (s.can_mark ? ('live' as const) : s.status))
              };
            }

            const isServerMarked = s.status === 'marked' || s.is_marked || s.is_present;
            if (isServerMarked) {
              markSessionLocally(s.session_key);
              return {
                ...s,
                is_marked: true,
                is_present: true,
                is_absent: false,
                is_on_leave: false,
                can_mark: false,
                show_mark_button: false,
                status: 'marked' as const
              };
            }
            unmarkSessionLocally(s.session_key);

            const isOnLeave = Boolean(s.status === 'leave' || s.is_on_leave);
            if (isOnLeave) {
              return {
                ...s,
                is_marked: false,
                is_present: false,
                is_absent: false,
                is_on_leave: true,
                can_mark: false,
                show_mark_button: false,
                status: 'leave' as const
              };
            }

            const isLive = s.status === 'live' || s.is_live || s.is_open_now;
            return {
              ...s,
              is_marked: false,
              is_present: false,
              is_absent: true,
              is_on_leave: false,
              can_mark: Boolean(isLive),
              show_mark_button: Boolean(isLive),
              status: isLive ? ('live' as const) : s.status
            };
          });
          setSchedules(validSchedules);
        }
      }

      // Fetch active forms for the logged-in student
      try {
        const formsRes = await apiClient.get('/forms/student/active');
        if (formsRes.data && (formsRes.data.success || formsRes.data.status === 'ok' || formsRes.data.status === 'success')) {
          const list: StudentFormItem[] = formsRes.data.data || [];
          setActiveForms(list);

          // Auto-popup trigger:
          // Pop up the first unsubmitted form automatically on student login/dashboard load
          const unsubmittedForm = list.find(f => !f.has_submitted);
          if (unsubmittedForm && !hasAutoPoppedRef.current) {
            hasAutoPoppedRef.current = true;
            handleOpenFormModal(unsubmittedForm);
          }
        }
      } catch (fErr) {
        console.error('Failed to load active forms', fErr);
      }

      // Fetch active One-Day Attendance sessions for this student
      try {
        const odRes = await apiClient.get('/one-day-attendance/student/available');
        if (odRes.data?.success && Array.isArray(odRes.data.data)) {
          setOneDaySessions(odRes.data.data);
        }
      } catch (odErr) {
        console.error('Failed to load one-day attendance sessions:', odErr);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const unsubmittedFormsCount = useMemo(() => {
    return activeForms.filter(f => !f.has_submitted).length;
  }, [activeForms]);

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
      if (res.data.success || res.data.status === 'ok' || res.data.status === 'success') {
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

  const [targetModalPhase, setTargetModalPhase] = useState<1 | 2>(1);

  const handleOpenMarkModal = (session: ScheduleItem, targetPhase?: 1 | 2) => {
    const defaultPhase = targetPhase || (session.active_phase === 2 ? 2 : 1);
    setTargetModalPhase(defaultPhase);
    setMarkingSession(session);
    setMarkError('');
    setMarkSuccess('');
  };

  const handleTriggerMarkAttendance = async (session: ScheduleItem) => {
    if (session.has_multiple_attendance) {
      if (!session.can_mark) return;
    } else {
      if (session.status === 'marked' || session.is_marked || locallyMarkedSessions.has(session.session_key)) {
        return;
      }
    }
    setIsMarking(true);
    setMarkError('');
    setMarkSuccess('');

    try {
      // 1. Connect to ESP32 GATT service and exchange challenge token
      const isGlobalSession = session.is_for_all_students !== 0 && session.is_for_all_students !== false;
      const studentFloorId = studentProfile?.floor_id !== undefined ? Number(studentProfile.floor_id) : (user?.floor_id !== undefined ? Number(user.floor_id) : 0);

      const bleConnection = await connectToESP32({
        isGlobal: isGlobalSession,
        floorId: studentFloorId
      });
      let tokenToUse = bleConnection.token;

      // 2. Disconnect from ESP32 immediately to free up BLE slot for classmates
      bleConnection.disconnect();

      // 3. Submit verified token with session_key, floor_id, and target_phase to backend
      const res = await apiClient.post('/attendance/mark', {
        proof: tokenToUse,
        rssi: -50,
        floor_id: studentFloorId,
        session_key: session.session_key,
        target_phase: targetModalPhase
      });

      if (res.data.success) {
        if (session.has_multiple_attendance) {
          const isPhase2 = res.data.phase === 2 || session.active_phase === 2;
          const msg = isPhase2
            ? `2nd Attendance recorded for ${session.session_name}! Attendance Complete ✨`
            : `1st Attendance recorded for ${session.session_name}! Don't forget to mark 2nd attendance during window 2.`;
          setMarkSuccess(msg);
          if (isPhase2) {
            markSessionLocally(session.session_key);
          }
          fetchStatus();
        } else {
          markSessionLocally(session.session_key);
          setMarkSuccess(`Attendance recorded for ${session.session_name}!`);
          setSchedules(prev => prev.map(s => {
            if (s.session_key === session.session_key) {
              return { ...s, status: 'marked', is_marked: true };
            }
            return s;
          }));
        }
        setTimeout(() => {
          setMarkingSession(null);
          setMarkSuccess('');
        }, 2000);
      } else {
        throw new Error(res.data.message || 'Failed to mark attendance.');
      }
    } catch (err: any) {
      const respData = err.response?.data;
      if (respData?.code === 'NOT_ELIGIBLE_MISSED_FIRST') {
        setMarkError('Not Eligible: You missed the 1st attendance window. Second attendance is only available to students who attended the 1st window.');
        return;
      }
      if (err.response?.data?.alreadyMarked || err.response?.data?.message?.toLowerCase().includes('already marked')) {
        markSessionLocally(session.session_key);
        setSchedules(prev => prev.map(s => s.session_key === session.session_key ? { ...s, status: 'marked', is_marked: true } : s));
        setMarkSuccess('Attendance already marked for today!');
        setTimeout(() => {
          setMarkingSession(null);
          setMarkSuccess('');
        }, 1800);
        return;
      }
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

  const handleOpenOneDayModal = (sess: OneDayStudentSession) => {
    setSelectedOneDaySession(sess);
    setOneDayMarkError('');
    setOneDayMarkSuccess('');
  };

  const handleTriggerMarkOneDayAttendance = async (session: OneDayStudentSession) => {
    if (session.has_marked) return;

    setIsMarkingOneDay(true);
    setOneDayMarkError('');
    setOneDayMarkSuccess('');

    try {
      // 1. Connect to ESP32 GATT service and exchange challenge token via Bluetooth
      const studentFloorId = studentProfile?.floor_id !== undefined ? Number(studentProfile.floor_id) : (user?.floor_id !== undefined ? Number(user.floor_id) : 0);
      const isGlobalSession = Boolean((session as any).is_for_all_students ?? true);

      const bleConnection = await connectToESP32({
        isGlobal: isGlobalSession,
        floorId: studentFloorId
      });
      let tokenToUse = bleConnection.token;

      // 2. Disconnect from ESP32 immediately to free up BLE slot for classmates
      bleConnection.disconnect();

      // 3. Submit verified token with session_id to backend
      const res = await apiClient.post('/one-day-attendance/student/mark', {
        session_id: session.id,
        proof: tokenToUse,
        floor_id: studentFloorId,
        rssi: -50
      });

      if (res.data?.success) {
        const recordData = res.data.data;
        const successMsg = res.data.message || 'Attendance verified via Bluetooth!';
        setOneDayMarkSuccess(successMsg);

        // Update local session state immediately
        setOneDaySessions(prev => prev.map(s => {
          if (s.id === session.id) {
            return {
              ...s,
              has_marked: true,
              can_mark: false,
              marked_time: recordData?.marked_time || 'Just now',
              student_status: recordData?.status || 'present',
              is_late: recordData?.is_late || false
            };
          }
          return s;
        }));

        setTimeout(() => {
          setSelectedOneDaySession(null);
          setOneDayMarkSuccess('');
        }, 1800);
      } else {
        throw new Error(res.data?.message || 'Failed to mark attendance.');
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Already marked
        setOneDaySessions(prev => prev.map(s => {
          if (s.id === session.id) {
            return { ...s, has_marked: true, can_mark: false };
          }
          return s;
        }));
        setOneDayMarkSuccess(err.response?.data?.message || 'Attendance already marked for this session.');
        setTimeout(() => {
          setSelectedOneDaySession(null);
          setOneDayMarkSuccess('');
        }, 1800);
        return;
      }
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
      setOneDayMarkError(err.response?.data?.message || err.message || 'Bluetooth connection failed. Ensure Bluetooth is ON and you are close to the ESP32 classroom device.');
    } finally {
      setIsMarkingOneDay(false);
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

  // Convert 24-hour time "18:45" to 12-hour formatted string "6:45 PM"
  const formatTo12Hour = (timeStr?: string | null): string => {
    if (!timeStr) return '';
    const parts = String(timeStr).trim().split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    const formattedMinutes = String(m).padStart(2, '0');
    return `${h}:${formattedMinutes} ${ampm}`;
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

  const activeLiveSession = useMemo(() => {
    return schedules.find(s => {
      if (s.has_multiple_attendance) {
        return Boolean(s.can_mark || s.status === 'live' || s.is_live || s.first_attendance?.is_open_now || s.second_attendance?.is_open_now);
      }
      return s.status === 'live' || s.is_live || (s.is_open_now && (s.status === 'marked' || s.is_marked || s.is_present));
    });
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
            {activeForms.length > 0 && (
              <button
                className={`student-forms-header-btn ${unsubmittedFormsCount > 0 ? 'has-unsubmitted' : ''}`}
                onClick={() => {
                  const targetForm = activeForms.find(f => !f.has_submitted) || activeForms[0];
                  handleOpenFormModal(targetForm);
                }}
                title="Active Forms & Polls"
              >
                <Vote size={16} />
                <span>Forms</span>
                {unsubmittedFormsCount > 0 ? (
                  <span className="forms-badge-counter">{unsubmittedFormsCount}</span>
                ) : (
                  <span className="forms-badge-counter completed">✓</span>
                )}
              </button>
            )}
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

        {/* Action Required: Unsubmitted Form Banner */}
        {unsubmittedFormsCount > 0 && (
          <div
            className="unanswered-form-banner"
            onClick={() => {
              const unsubmitted = activeForms.find(f => !f.has_submitted);
              if (unsubmitted) handleOpenFormModal(unsubmitted);
            }}
          >
            <div className="unanswered-banner-left">
              <div className="unanswered-icon-circle">
                <Sparkles size={16} />
              </div>
              <div className="unanswered-banner-texts">
                <div className="unanswered-banner-title">
                  {unsubmittedFormsCount === 1 ? 'New Form / Poll Available' : `${unsubmittedFormsCount} New Forms & Polls Available`}
                </div>
                <div className="unanswered-banner-sub">
                  Please submit your response to administration. Click to answer now.
                </div>
              </div>
            </div>
            <button className="unanswered-banner-btn" onClick={(e) => {
              e.stopPropagation();
              const unsubmitted = activeForms.find(f => !f.has_submitted);
              if (unsubmitted) handleOpenFormModal(unsubmitted);
            }}>
              Answer <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Live Active Banner if a session is currently open */}
        {activeLiveSession && (() => {
          const isTwoPhase = Boolean(activeLiveSession.has_multiple_attendance);
          const isSessionMarked = isTwoPhase
            ? (activeLiveSession.active_phase === 1
              ? activeLiveSession.first_attendance?.is_marked
              : (activeLiveSession.active_phase === 2
                ? activeLiveSession.second_attendance?.is_marked
                : (activeLiveSession.first_attendance?.is_marked && activeLiveSession.second_attendance?.is_marked)))
            : (activeLiveSession.status === 'marked' || activeLiveSession.is_marked || activeLiveSession.is_present || locallyMarkedSessions.has(activeLiveSession.session_key));
          const isSessionOnLeave = (activeLiveSession.status === 'leave' || activeLiveSession.is_on_leave) && !isSessionMarked;
          const isNotEligibleForPhase2 = isTwoPhase && activeLiveSession.active_phase === 2 && !activeLiveSession.first_attendance?.is_marked;

          let bannerLabel = isSessionMarked ? 'ATTENDANCE CONFIRMED' : isSessionOnLeave ? 'APPROVED LEAVE' : 'SESSION LIVE NOW';
          let timeWindowText = `${formatTo12Hour(activeLiveSession.start_time)} - ${formatTo12Hour(activeLiveSession.end_time)}`;
          let buttonLabel = 'Mark Now';

          if (isTwoPhase) {
            if (activeLiveSession.active_phase === 1) {
              bannerLabel = isSessionMarked ? '1ST ATTENDANCE CONFIRMED' : '1ST ATTENDANCE LIVE NOW';
              timeWindowText = `Window 1: ${formatTo12Hour(activeLiveSession.first_attendance?.start_time || activeLiveSession.start_time)} - ${formatTo12Hour(activeLiveSession.first_attendance?.end_time || activeLiveSession.end_time)}`;
              buttonLabel = 'Mark 1st Now';
            } else if (activeLiveSession.active_phase === 2) {
              if (isSessionMarked) {
                bannerLabel = '2ND ATTENDANCE CONFIRMED (COMPLETE ✨)';
              } else if (isNotEligibleForPhase2) {
                bannerLabel = 'NOT ELIGIBLE (MISSED 1ST ATTENDANCE)';
              } else {
                bannerLabel = '2ND ATTENDANCE LIVE NOW';
              }
              timeWindowText = `Window 2: ${formatTo12Hour(activeLiveSession.second_attendance?.start_time || activeLiveSession.phase2_start_time)} - ${formatTo12Hour(activeLiveSession.second_attendance?.end_time || activeLiveSession.phase2_end_time)}`;
              buttonLabel = 'Mark 2nd Now';
            }
          }

          return (
            <div className={`active-session-banner ${isSessionMarked ? 'banner-marked' : isSessionOnLeave ? 'banner-leave' : isNotEligibleForPhase2 ? 'banner-not-eligible' : ''}`}>
              <div className="active-banner-left">
                <span className={isSessionMarked ? "marked-check-dot" : isSessionOnLeave ? "leave-calendar-dot" : "live-pulse-dot"}>
                  {isSessionMarked ? <Check size={13} strokeWidth={3} /> : isSessionOnLeave ? <CalendarCheck size={13} strokeWidth={2.5} /> : null}
                </span>
                <div>
                  <div className="active-banner-label">
                    {bannerLabel}
                  </div>
                  <div className="active-banner-title">
                    {activeLiveSession.session_name} ({timeWindowText})
                  </div>
                </div>
              </div>
              {isSessionMarked ? (
                <div className="active-banner-marked-badge">
                  <CheckCircle size={14} strokeWidth={2.5} /> {isTwoPhase && activeLiveSession.active_phase === 1 ? '1st Marked' : isTwoPhase && activeLiveSession.active_phase === 2 ? '2nd Marked' : 'Marked'}
                </div>
              ) : isSessionOnLeave ? (
                <div className="active-banner-leave-badge">
                  <CalendarCheck size={14} strokeWidth={2.5} /> On Leave
                </div>
              ) : isNotEligibleForPhase2 ? (
                <div className="active-banner-leave-badge" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                  <AlertTriangle size={14} strokeWidth={2.5} /> Missed 1st Window
                </div>
              ) : (
                <button
                  className="active-banner-cta"
                  onClick={() => handleOpenMarkModal(activeLiveSession, activeLiveSession.active_phase === 2 ? 2 : 1)}
                >
                  <Fingerprint size={16} /> {buttonLabel}
                </button>
              )}
            </div>
          );
        })()}

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

        {/* One-Day Attendance Section */}
        <div className="one-day-section-wrapper">
          <div className="schedule-section-header">
            <div className="schedule-title-group">
              <div className="schedule-accent-bar" style={{ background: 'linear-gradient(to bottom, #0d9488, #14b8a6)' }}></div>
              <h3 className="schedule-section-title">One-Day Attendance</h3>
            </div>
            <span className="schedule-session-count" style={{ background: '#ccfbf1', color: '#0f766e' }}>
              {oneDaySessions.length} {oneDaySessions.length === 1 ? 'Session' : 'Sessions'}
            </span>
          </div>

          {oneDaySessions.length === 0 ? (
            <div className="one-day-empty-card">
              <CalendarCheck size={28} className="one-day-empty-icon" />
              <div className="one-day-empty-title">No Active One-Day Sessions</div>
              <div className="one-day-empty-sub">
                Special on-demand attendance sessions configured by administration will appear here.
              </div>
            </div>
          ) : (
            <div className="one-day-cards-list">
              {oneDaySessions.map((session) => {
                const isMarked = session.has_marked;
                const isLive = session.is_live_now && !isMarked;
                const isUpcoming = session.is_upcoming && !isMarked;
                const isExpired = (session.is_expired || session.status === 'completed') && !isMarked;

                return (
                  <div
                    key={`oneday_${session.id}`}
                    className={`one-day-student-card ${isLive ? 'card-live' : isMarked ? 'card-marked' : isExpired ? 'card-expired' : 'card-upcoming'}`}
                  >
                    {/* Header */}
                    <div className="one-day-card-header">
                      <div className="one-day-header-left">
                        <div className={`one-day-icon-circle ${isMarked ? 'icon-marked' : isLive ? 'icon-live' : 'icon-default'}`}>
                          {isMarked ? <CheckCircle size={20} /> : isLive ? <CalendarCheck size={20} /> : <Calendar size={20} />}
                        </div>
                        <div className="one-day-title-block">
                          <div className="one-day-name-row">
                            <span className="one-day-title-text">{session.title}</span>
                            <span className="one-day-bluetooth-tag" title="ESP32 Bluetooth Verification">
                              <Radio size={11} /> Bluetooth
                            </span>
                          </div>
                          <div className="one-day-time-meta">
                            <span className="one-day-meta-date">
                              <Calendar size={12} /> {session.session_date}
                            </span>
                            <span className="meta-dot">•</span>
                            <span className="one-day-meta-window">
                              <Clock size={12} /> {formatTo12Hour(session.start_time)} – {formatTo12Hour(session.end_time)}
                            </span>
                            {session.late_time && (
                              <>
                                <span className="meta-dot">•</span>
                                <span className="one-day-late-cutoff">
                                  Late after {formatTo12Hour(session.late_time)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="one-day-header-right">
                        {isMarked ? (
                          <span className={`one-day-pill marked ${session.is_late ? 'late' : 'ontime'}`}>
                            <Check size={12} strokeWidth={3} /> {session.is_late ? 'Late Marked' : 'Marked'}
                          </span>
                        ) : isLive ? (
                          <span className="one-day-pill live">
                            <span className="pulse-indicator"></span> Live Now
                          </span>
                        ) : isUpcoming ? (
                          <span className="one-day-pill upcoming">
                            <Clock size={12} /> Upcoming
                          </span>
                        ) : (
                          <span className="one-day-pill expired">
                            <Lock size={12} /> Closed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Instructions / Description if provided */}
                    {session.description && (
                      <div className="one-day-instructions-box">
                        <strong className="inst-prefix">Note:</strong> {session.description}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="one-day-card-footer">
                      {isMarked ? (
                        <div className="one-day-marked-status-bar">
                          <CheckCircle size={15} className="marked-status-icon" />
                          <span>
                            Attendance verified at <strong>{session.marked_time || 'Recorded'}</strong>
                            {session.is_late ? ' (Late Arrival)' : ' (On-Time)'}
                          </span>
                        </div>
                      ) : isLive ? (
                        <button
                          type="button"
                          className="one-day-mark-action-btn"
                          onClick={() => handleOpenOneDayModal(session)}
                        >
                          <Fingerprint size={17} /> Mark Attendance Now
                        </button>
                      ) : isUpcoming ? (
                        <div className="one-day-disabled-note upcoming">
                          <Clock size={13} />
                          <span>
                            Opens {session.is_date_today ? 'today' : `on ${session.session_date}`} at {formatTo12Hour(session.start_time)}
                          </span>
                        </div>
                      ) : (
                        <div className="one-day-disabled-note expired">
                          <Lock size={13} />
                          <span>Attendance window closed at {formatTo12Hour(session.end_time)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
                if (session.has_multiple_attendance) {
                  const isBothMarked = Boolean(session.first_attendance?.is_marked && session.second_attendance?.is_marked);
                  const isOnLeave = Boolean((session.status === 'leave' || session.is_on_leave) && !isBothMarked);
                  const is1stMarked = Boolean(session.first_attendance?.is_marked);
                  const is2ndMarked = Boolean(session.second_attendance?.is_marked);
                  const is1stOpen = Boolean(session.first_attendance?.is_open_now);
                  const is2ndOpen = Boolean(session.second_attendance?.is_open_now);
                  const isPhase2NotEligible = !is1stMarked && session.first_attendance?.status === 'closed';

                  let cardClass = 'session-card multi-phase-card';
                  if (session.can_mark) cardClass += ' live-card';
                  else if (isBothMarked) cardClass += ' marked-card';
                  else if (isOnLeave) cardClass += ' leave-card';
                  else if (isPhase2NotEligible) cardClass += ' closed-card';

                  return (
                    <div key={session.session_key} className="schedule-timeline-row">
                      {/* Left Start Time */}
                      <div className="timeline-time-col">
                        <span className="time-primary">{formatTo12Hour(session.first_attendance?.start_time || session.start_time)}</span>
                        <span className="time-secondary">{formatTo12Hour(session.second_attendance?.end_time || session.phase2_end_time || session.end_time)}</span>
                      </div>

                      {/* Timeline Connector & Dot */}
                      <div className="timeline-dot-wrapper">
                        <div className="timeline-line"></div>
                        <div className={`timeline-dot ${isBothMarked ? 'marked' : isOnLeave ? 'leave' : session.can_mark ? 'live' : 'upcoming'}`}></div>
                      </div>

                      {/* Session Card */}
                      <div className={cardClass}>
                        <div className="multi-phase-header">
                          <div className="session-left-group">
                            {getSessionIcon(session)}

                            <div className="session-info-group">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h4 className="session-name-text">{session.session_name}</h4>
                                <span className="multi-phase-indicator-pill">2-Phase Session</span>
                              </div>
                              <div className="session-time-text">
                                Full Window: {formatTo12Hour(session.first_attendance?.start_time || session.start_time)} – {formatTo12Hour(session.second_attendance?.end_time || session.phase2_end_time || session.end_time)}
                              </div>
                            </div>
                          </div>

                          <div className="multi-phase-overall-badge-wrap">
                            {isBothMarked ? (
                              <span className="status-pill-badge marked" title="Both attendances completed">
                                <CheckCircle size={13} strokeWidth={2.5} /> Complete (Both Marked)
                              </span>
                            ) : isOnLeave ? (
                              <span className="status-pill-badge leave" title="Approved leave for today">
                                <CalendarCheck size={13} strokeWidth={2.5} /> On Leave
                              </span>
                            ) : is1stMarked && !is2ndMarked ? (
                              is2ndOpen ? (
                                <span className="status-pill-badge" style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                  <Clock size={13} /> 2nd Window Live
                                </span>
                              ) : session.second_attendance?.status === 'closed' ? (
                                <span className="status-pill-badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                                  <AlertTriangle size={13} /> Incomplete (Missed 2nd)
                                </span>
                              ) : (
                                <span className="status-pill-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                                  <Clock size={13} /> 1st Done • Wait for 2nd
                                </span>
                              )
                            ) : isPhase2NotEligible ? (
                              <span className="status-pill-badge" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                <AlertTriangle size={13} /> Missed 1st (Not Eligible)
                              </span>
                            ) : is1stOpen ? (
                              <span className="status-pill-badge" style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                <Clock size={13} /> 1st Window Live
                              </span>
                            ) : (
                              <span className="status-pill-badge upcoming">
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Two Windows Breakdown Grid */}
                        <div className="multi-phase-windows-grid">
                          {/* Window 1 */}
                          <div className={`multi-phase-subcard ${is1stMarked ? 'marked' : is1stOpen ? 'live' : ''}`}>
                            <div className="subcard-top">
                              <div className="subcard-title">
                                <span className="phase-number-tag">1</span>
                                <span>First Attendance</span>
                              </div>
                              {is1stMarked ? (
                                <span className="subcard-status-badge marked">
                                  <CheckCircle size={12} strokeWidth={2.5} /> {session.first_attendance?.is_late ? 'Late' : 'Present'}
                                </span>
                              ) : is1stOpen ? (
                                <span className="subcard-status-badge live">● Live Now</span>
                              ) : session.first_attendance?.status === 'closed' ? (
                                <span className="subcard-status-badge missed">Missed</span>
                              ) : (
                                <span className="subcard-status-badge upcoming">Upcoming</span>
                              )}
                            </div>
                            <div className="subcard-time">
                              <Clock size={12} />
                              <span>{formatTo12Hour(session.first_attendance?.start_time || session.start_time)} – {formatTo12Hour(session.first_attendance?.end_time || session.end_time)}</span>
                            </div>
                            {session.first_attendance?.late_time && (
                              <div className="subcard-note">
                                Late after {formatTo12Hour(session.first_attendance.late_time)}
                              </div>
                            )}
                            {is1stMarked ? (
                              <div className="subcard-marked-info">
                                Recorded at {session.first_attendance?.marked_at || 'Done'}
                              </div>
                            ) : is1stOpen && session.can_mark ? (
                              <button
                                className="mark-attendance-btn subcard-cta-btn"
                                onClick={() => handleOpenMarkModal(session, 1)}
                              >
                                <Fingerprint size={15} /> Mark 1st Attendance
                              </button>
                            ) : null}
                          </div>

                          {/* Window 2 */}
                          <div className={`multi-phase-subcard ${is2ndMarked ? 'marked' : is2ndOpen && is1stMarked ? 'live' : isPhase2NotEligible ? 'not-eligible' : ''}`}>
                            <div className="subcard-top">
                              <div className="subcard-title">
                                <span className="phase-number-tag">2</span>
                                <span>Second Attendance</span>
                              </div>
                              {is2ndMarked ? (
                                <span className="subcard-status-badge marked">
                                  <CheckCircle size={12} strokeWidth={2.5} /> {session.second_attendance?.is_late ? 'Late' : 'Present'}
                                </span>
                              ) : isPhase2NotEligible ? (
                                <span className="subcard-status-badge not-eligible" title="Only students who attended 1st window can mark 2nd window">
                                  Not Eligible
                                </span>
                              ) : is2ndOpen ? (
                                <span className="subcard-status-badge live">● Live Now</span>
                              ) : session.second_attendance?.status === 'closed' ? (
                                <span className="subcard-status-badge missed">Missed</span>
                              ) : (
                                <span className="subcard-status-badge upcoming">Upcoming</span>
                              )}
                            </div>
                            <div className="subcard-time">
                              <Clock size={12} />
                              <span>{formatTo12Hour(session.second_attendance?.start_time || session.phase2_start_time)} – {formatTo12Hour(session.second_attendance?.end_time || session.phase2_end_time)}</span>
                            </div>
                            {session.second_attendance?.late_time && (
                              <div className="subcard-note">
                                Late after {formatTo12Hour(session.second_attendance.late_time)}
                              </div>
                            )}
                            {is2ndMarked ? (
                              <div className="subcard-marked-info">
                                Recorded at {session.second_attendance?.marked_at || 'Done'}
                              </div>
                            ) : isPhase2NotEligible ? (
                              <div className="subcard-eligibility-warning">
                                <AlertTriangle size={12} /> Missed 1st window; cannot mark 2nd.
                              </div>
                            ) : is2ndOpen && session.can_mark ? (
                              <button
                                className="mark-attendance-btn subcard-cta-btn"
                                onClick={() => handleOpenMarkModal(session, 2)}
                              >
                                <Fingerprint size={15} /> Mark 2nd Attendance
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isMarked = session.status === 'marked' || session.is_marked || session.is_present || locallyMarkedSessions.has(session.session_key);
                const isOnLeave = (session.status === 'leave' || session.is_on_leave) && !isMarked;
                const isAbsent = !isMarked && !isOnLeave;
                const isLive = (session.status === 'live' || session.is_live || session.is_open_now) && isAbsent;
                const isClosed = session.status === 'closed' && isAbsent && !isLive;
                const isUpcoming = !isMarked && !isOnLeave && !isLive && !isClosed;

                let cardClass = 'session-card';
                if (isLive) cardClass += ' live-card';
                else if (isMarked) cardClass += ' marked-card';
                else if (isOnLeave) cardClass += ' leave-card';
                else if (isClosed) cardClass += ' closed-card';

                return (
                  <div key={session.session_key} className="schedule-timeline-row">
                    {/* Left Start Time */}
                    <div className="timeline-time-col">
                      <span className="time-primary">{formatTo12Hour(session.start_time)}</span>
                      <span className="time-secondary">{formatTo12Hour(session.end_time)}</span>
                    </div>

                    {/* Timeline Connector & Dot */}
                    <div className="timeline-dot-wrapper">
                      <div className="timeline-line"></div>
                      <div className={`timeline-dot ${isMarked ? 'marked' : isOnLeave ? 'leave' : session.status}`}></div>
                    </div>

                    {/* Session Card */}
                    <div className={cardClass}>
                      <div className="session-left-group">
                        {getSessionIcon(session)}

                        <div className="session-info-group">
                          <h4 className="session-name-text">{session.session_name}</h4>
                          <div className="session-time-text">
                            {formatTo12Hour(session.start_time)} – {formatTo12Hour(session.end_time)}
                          </div>
                          {session.late_time && (
                            <span className="session-late-pill">
                              Late after {formatTo12Hour(session.late_time)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action / Status Badge */}
                      <div className="session-status-container">
                        {isMarked ? (
                          <span className="status-pill-badge marked" title="Attendance recorded">
                            <CheckCircle size={13} strokeWidth={2.5} /> Marked
                          </span>
                        ) : isOnLeave ? (
                          <span className="status-pill-badge leave" title="Approved leave for today">
                            <CalendarCheck size={13} strokeWidth={2.5} /> On Leave
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
      {markingSession && (() => {
        const isTwoPhase = Boolean(markingSession.has_multiple_attendance);
        const activePhase = targetModalPhase || markingSession.active_phase || 1;
        const isSessionAlreadyMarked = isTwoPhase
          ? (activePhase === 1 ? markingSession.first_attendance?.is_marked : markingSession.second_attendance?.is_marked)
          : (markingSession.status === 'marked' || markingSession.is_marked || locallyMarkedSessions.has(markingSession.session_key));
        const isNotEligibleForPhase2 = isTwoPhase && activePhase === 2 && !markingSession.first_attendance?.is_marked;
        const windowTimeText = isTwoPhase
          ? (activePhase === 1
            ? `Window 1: ${formatTo12Hour(markingSession.first_attendance?.start_time || markingSession.start_time)} – ${formatTo12Hour(markingSession.first_attendance?.end_time || markingSession.end_time)}`
            : `Window 2: ${formatTo12Hour(markingSession.second_attendance?.start_time || markingSession.phase2_start_time)} – ${formatTo12Hour(markingSession.second_attendance?.end_time || markingSession.phase2_end_time)}`)
          : `Session window: ${formatTo12Hour(markingSession.start_time)} – ${formatTo12Hour(markingSession.end_time)}`;

        const modalTitle = isTwoPhase
          ? `${markingSession.session_name} (${activePhase === 2 ? '2nd Attendance' : '1st Attendance'})`
          : `${markingSession.session_name} Attendance`;

        return (
          <div className="modal-overlay" onClick={() => !isMarking && setMarkingSession(null)}>
            <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
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
                {isSessionAlreadyMarked ? <CheckCircle size={28} color="#10b981" /> : isNotEligibleForPhase2 ? <AlertTriangle size={28} color="#dc2626" /> : <Fingerprint size={28} />}
              </div>

              <h3 className="modal-title">
                {modalTitle}
              </h3>
              <p className="modal-subtitle">
                {windowTimeText}
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
              ) : isNotEligibleForPhase2 ? (
                <div className="modal-success-box" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div className="modal-success-icon-wrap" style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <AlertTriangle size={44} />
                  </div>
                  <h4 className="modal-success-title" style={{ color: '#991b1b' }}>
                    Not Eligible for Second Attendance
                  </h4>
                  <p className="modal-success-msg" style={{ color: '#b91c1c' }}>
                    You did not complete the first attendance window for this session. In two-phase attendance, only students who marked the first attendance are permitted to mark the second attendance.
                  </p>
                  <button
                    className="mark-already-done-close-btn"
                    style={{ background: '#dc2626' }}
                    onClick={() => setMarkingSession(null)}
                  >
                    Close
                  </button>
                </div>
              ) : isSessionAlreadyMarked ? (
                <div className="modal-success-box">
                  <div className="modal-success-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
                    <CheckCircle size={44} />
                  </div>
                  <h4 className="modal-success-title" style={{ color: '#065f46' }}>
                    {isTwoPhase ? `${activePhase === 2 ? '2nd' : '1st'} Attendance Already Marked` : 'Attendance Already Marked'}
                  </h4>
                  <p className="modal-success-msg" style={{ color: '#047857' }}>
                    Your attendance for {markingSession.session_name} is already confirmed and recorded in the database.
                  </p>
                  <button
                    className="mark-already-done-close-btn"
                    onClick={() => setMarkingSession(null)}
                  >
                    Done
                  </button>
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
                      {isMarking ? 'Scanning for Classroom ESP32...' : `Tap to Mark ${isTwoPhase ? (activePhase === 2 ? '2nd Attendance' : '1st Attendance') : 'Attendance'}`}
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
        );
      })()}

      {/* One-Day Attendance Marking Modal */}
      {selectedOneDaySession && (
        <div className="modal-overlay" onClick={() => !isMarkingOneDay && setSelectedOneDaySession(null)}>
          <div className="modal-content-box one-day-modal-box" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => {
                if (!isMarkingOneDay) {
                  setSelectedOneDaySession(null);
                  setOneDayMarkError('');
                  setOneDayMarkSuccess('');
                }
              }}
            >
              <X size={18} />
            </button>

            <div className="modal-header-icon-box" style={{ background: '#ccfbf1', color: '#0f766e' }}>
              <CalendarCheck size={28} />
            </div>

            <h3 className="modal-title">
              {selectedOneDaySession.title}
            </h3>
            <p className="modal-subtitle">
              Session Window: <strong>{formatTo12Hour(selectedOneDaySession.start_time)} – {formatTo12Hour(selectedOneDaySession.end_time)}</strong>
            </p>

            {oneDayMarkSuccess ? (
              <div className="modal-success-box">
                <div className="modal-success-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <CheckCircle size={44} />
                </div>
                <h4 className="modal-success-title">
                  Attendance Recorded!
                </h4>
                <p className="modal-success-msg">
                  {oneDayMarkSuccess}
                </p>
                <button
                  className="mark-already-done-close-btn"
                  onClick={() => setSelectedOneDaySession(null)}
                >
                  Close
                </button>
              </div>
            ) : selectedOneDaySession.has_marked ? (
              <div className="modal-success-box">
                <div className="modal-success-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <CheckCircle size={44} />
                </div>
                <h4 className="modal-success-title" style={{ color: '#065f46' }}>
                  Attendance Already Marked
                </h4>
                <p className="modal-success-msg" style={{ color: '#047857' }}>
                  Your attendance for {selectedOneDaySession.title} is already confirmed and recorded in the database.
                </p>
                <button
                  className="mark-already-done-close-btn"
                  onClick={() => setSelectedOneDaySession(null)}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="modal-radar-wrapper" style={{ marginTop: '0.5rem' }}>
                {selectedOneDaySession.description && (
                  <div className="one-day-modal-instructions" style={{ marginBottom: '1rem', width: '100%' }}>
                    <span className="inst-label">Instructions:</span> {selectedOneDaySession.description}
                  </div>
                )}

                <RadarAnimation isScanning={isMarkingOneDay}>
                  <button
                    onClick={() => handleTriggerMarkOneDayAttendance(selectedOneDaySession)}
                    disabled={isMarkingOneDay}
                    className="modal-fingerprint-btn"
                    style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' }}
                  >
                    <Fingerprint size={48} />
                  </button>
                </RadarAnimation>

                <div className="modal-scan-text-wrap">
                  <div className="modal-scan-status">
                    {isMarkingOneDay ? 'Connecting to ESP32 via Bluetooth...' : 'Tap to Mark Attendance via Bluetooth'}
                  </div>
                  <div className="modal-scan-hint">
                    Ensure Bluetooth & Location are enabled and you are near the classroom ESP32 device.
                  </div>
                </div>

                {oneDayMarkError && (
                  <div className="modal-error-badge">
                    <AlertTriangle size={15} />
                    <span>{oneDayMarkError}</span>
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
