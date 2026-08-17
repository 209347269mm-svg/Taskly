import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';

interface NoteItem {
  id: string;
  text: string;
  author: string;
  time: string;
  isManagerOnly?: boolean;
}

interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

interface Task {
  id: string;
  project: string;
  topic: string;
  description: string;
  assignee: string;
  startDate: string;
  dueDate: string;
  completedDate?: string;
  delays: number;
  priority: 'נמוכה' | 'בינונית' | 'גבוהה';
  isArchived: boolean;
  isDeleted: boolean;
  orderIndex?: number;
  status: 'פתוח' | 'בביצוע' | 'הושלם' | 'נדחה';
  notes: NoteItem[];
  subtasks: SubTask[];
}

interface ProjectDoc {
  id: string;
  name: string;
  color?: string;
}

const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#4f46e5'];
const FONT_FAMILY = "'Assistant', 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [userRole, setUserRole] = useState<'משתמש' | 'מנהל'>(() => (localStorage.getItem('taskly_role') as any) || 'משתמש');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');

  // התחברות
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');
  const [authError, setAuthError] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // סיסמת מנהל
  const [adminPassword, setAdminPassword] = useState('1234');
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'calendar' | 'dashboard'>('table');
  const [currentTab, setCurrentTab] = useState<'active' | 'archived' | 'trash'>('active');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('הכל');
  const [statusFilter, setStatusFilter] = useState<string>('הכל');
  const [priorityFilter, setPriorityFilter] = useState<string>('הכל');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'delays' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedTaskIdsForWhatsApp, setSelectedTaskIdsForWhatsApp] = useState<string[]>([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'נמוכה' | 'בינונית' | 'גבוהה'>('בינונית');
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});

  useEffect(() => {
    localStorage.setItem('taskly_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) signInAnonymously(auth).catch((err) => console.error(err));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'admin_config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().adminPassword) {
        setAdminPassword(docSnap.data().adminPassword);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'projects_list'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        color: d.data().color || '#2563eb'
      }));
      setProjects(fetched);
      if (fetched.length > 0 && !newProject) setNewProject(fetched[0].name);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('startDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Task[] = snapshot.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          project: data.project || 'כללי',
          topic: data.topic || '',
          description: data.description || '',
          assignee: data.assignee || '',
          startDate: data.startDate || '',
          dueDate: data.dueDate || '',
          completedDate: data.completedDate || '',
          delays: data.delays || 0,
          priority: data.priority || 'בינונית',
          isArchived: !!data.isArchived,
          isDeleted: !!data.isDeleted,
          orderIndex: data.orderIndex || 0,
          status: data.status || 'פתוח',
          notes: (data.notes || []).map((n: any, idx: number) => ({
            id: n.id || `note_${idx}`,
            text: n.text || '',
            author: n.author || 'אורח',
            time: n.time || '',
            isManagerOnly: !!n.isManagerOnly
          })),
          subtasks: (data.subtasks || []).map((s: any, idx: number) => ({
            id: s.id || `sub_${idx}`,
            text: s.text || '',
            completed: !!s.completed
          }))
        };
      });
      setTasks(fetched);
    });
    return () => unsubscribe();
  }, []);

  const calculateDelayDays = (dueDate: string, status: string, completedDate?: string) => {
    if (!dueDate) return 0;
    const due = new Date(dueDate).getTime();
    const end = status === 'הושלם' && completedDate ? new Date(completedDate).getTime() : new Date().setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((end - due) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const isDueSoon = (dueDate: string, status: string) => {
    if (!dueDate || status === 'הושלם') return false;
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!nameInput.trim()) {
      setAuthError('נא להזין שם מלא או שם משתמש.');
      return;
    }
    if (roleInput === 'מנהל' && passwordInput !== adminPassword) {
      setAuthError('סיסמת מנהל שגויה.');
      return;
    }
    localStorage.setItem('taskly_user', nameInput.trim());
    localStorage.setItem('taskly_role', roleInput);
    setCurrentUser(nameInput.trim());
    setUserRole(roleInput);
  };

  const handleLogout = () => {
    localStorage.removeItem('taskly_user');
    localStorage.removeItem('taskly_role');
    setCurrentUser(null);
    setPasswordInput('');
    setAuthError('');
    setIsUserMenuOpen(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'מנהל') return;
    const trimmed = newProjectNameInput.trim();
    if (!trimmed) return;
    await addDoc(collection(db, 'projects_list'), {
      name: trimmed,
      color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
      createdAt: serverTimestamp()
    });
    setNewProject(trimmed);
    setNewProjectNameInput('');
    setShowAddProjectModal(false);
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (userRole !== 'מנהל') return;
    if (!window.confirm(`האם למחוק את הפרויקט "${projectName}"?`)) return;
    await deleteDoc(doc(db, 'projects_list', projectId));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'מנהל') return;
    if (!newDescription || !newDescription.trim()) {
      alert("נא להזין תיאור משימה.");
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'tasks'), {
        project: newProject || (projects[0]?.name || 'פרויקט כללי'),
        topic: newTopic ? newTopic.trim() : '',
        description: newDescription.trim(),
        assignee: newAssignee ? newAssignee.trim() : '',
        startDate: todayStr,
        dueDate: newDueDate || '',
        completedDate: '',
        delays: 0,
        priority: newPriority,
        isArchived: false,
        isDeleted: false,
        status: 'פתוח',
        orderIndex: Date.now(),
        notes: [],
        subtasks: [],
        createdAt: serverTimestamp()
      });
      setNewDescription('');
      setNewTopic('');
      setNewDueDate('');
      setNewAssignee('');
      setShowAddTaskModal(false);
    } catch (err) {
      console.error(err);
      alert("שגיאה ביצירת המשימה.");
    }
  };

  const handleAddNote = async (taskId: string) => {
    const text = noteInputs[taskId]?.trim();
    if (!text) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newNotes = [...(task.notes || []), {
      id: `note_${Date.now()}`,
      text,
      author: currentUser || 'אורח',
      time: `${formattedDate} ${formattedTime}`
    }];

    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setNoteInputs({ ...noteInputs, [taskId]: '' });
  };

  const handleStatusChange = async (taskId: string, newStatus: 'פתוח' | 'בביצוע' | 'הושלם' | 'נדחה') => {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const task = tasks.find((t) => t.id === taskId);
    const auditNote: NoteItem = {
      id: `audit_${Date.now()}`,
      text: `🔄 הסטטוס שונה ל-"${newStatus}" על ידי ${currentUser}`,
      author: 'מערכת',
      time: formattedDate
    };
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : '',
      notes: [...(task?.notes || []), auditNote]
    });
  };

  const handleExportCSV = () => {
    const activeTasks = tasks.filter((t) => !t.isDeleted && (currentTab === 'archived' ? t.isArchived : !t.isArchived));
    if (activeTasks.length === 0) {
      alert("אין נתונים לייצוא.");
      return;
    }
    const headers = ['פרויקט', 'נושא', 'תיאור המשימה', 'אחראי', 'עדיפות', 'תאריך יעד', 'סטטוס'];
    const rows = activeTasks.map((t) => [
      `"${t.project}"`,
      `"${t.topic}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.assignee.replace(/\n/g, ', ')}"`,
      `"${t.priority}"`,
      `"${t.dueDate}"`,
      `"${t.status}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `משימות_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const allProjectNames = useMemo(() => {
    return Array.from(new Set([...projects.map((p) => p.name), ...tasks.map((t) => t.project)]));
  }, [projects, tasks]);

  const handleSort = (column: 'dueDate' | 'priority' | 'delays') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const priorityWeights = { 'גבוהה': 3, 'בינונית': 2, 'נמוכה': 1 };

  const filteredTasks = useMemo(() => {
    let result = tasks.filter((t) => {
      let matchTab = currentTab === 'trash' ? t.isDeleted : currentTab === 'archived' ? (!t.isDeleted && t.isArchived) : (!t.isDeleted && !t.isArchived);
      const matchProject = selectedProjectFilter === 'הכל' || t.project === selectedProjectFilter;
      const matchStatus = statusFilter === 'הכל' || t.status === statusFilter;
      
      const matchPriority = priorityFilter === 'הכל' || t.priority === priorityFilter;

      const matchSearch = searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      return matchTab && matchProject && matchStatus && matchPriority && matchSearch;
    });

    if (sortBy !== 'none') {
      result.sort((a, b) => {
        if (sortBy === 'dueDate') {
          return sortOrder === 'asc' ? (new Date(a.dueDate).getTime() || 0) - (new Date(b.dueDate).getTime() || 0) : (new Date(b.dueDate).getTime() || 0) - (new Date(a.dueDate).getTime() || 0);
        }
        if (sortBy === 'priority') {
          return sortOrder === 'asc' ? (priorityWeights[a.priority] || 0) - (priorityWeights[b.priority] || 0) : (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
        }
        if (sortBy === 'delays') {
          return sortOrder === 'asc' ? (a.delays || 0) - (b.delays || 0) : (b.delays || 0) - (a.delays || 0);
        }
        return 0;
      });
    } else {
      result.sort((a, b) => (b.orderIndex || 0) - (a.orderIndex || 0));
    }
    return result;
  }, [tasks, currentTab, selectedProjectFilter, statusFilter, priorityFilter, searchTerm, sortBy, sortOrder]);

  const getProjectColor = (pName: string) => {
    const p = projects.find((x) => x.name === pName);
    return p?.color || '#2563eb';
  };

  const counts = useMemo(() => {
    return {
      active: tasks.filter((t) => !t.isDeleted && !t.isArchived).length,
      archived: tasks.filter((t) => !t.isDeleted && t.isArchived).length,
      trash: tasks.filter((t) => t.isDeleted).length
    };
  }, [tasks]);

  const theme = {
    bg: isDarkMode ? '#090d16' : '#f8fafc',
    cardBg: isDarkMode ? '#111827' : '#ffffff',
    textMain: isDarkMode ? '#f9fafb' : '#0f172a',
    textMuted: isDarkMode ? '#9ca3af' : '#64748b',
    border: isDarkMode ? '#1f2937' : '#e2e8f0',
    subCardBg: isDarkMode ? '#1e293b' : '#f8fafc',
    inputBg: isDarkMode ? '#1f2937' : '#ffffff',
    inputText: isDarkMode ? '#ffffff' : '#0f172a'
  };

  // --- מסך כניסה מקורי ---
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: '20px', direction: 'rtl', fontFamily: FONT_FAMILY, transition: 'background-color 0.2s', position: 'relative' }}>
        <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ position: 'absolute', top: '20px', right: '20px', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
          {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
        </button>

        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: theme.cardBg, borderRadius: '24px', padding: '36px 28px', border: `1px solid ${theme.border}`, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', backgroundColor: '#2563eb', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px' }}>✓</div>
          <h2 style={{ fontSize: '25px', fontWeight: '900', color: theme.textMain, margin: '0 0 6px 0' }}>כניסה למערכת</h2>
          <p style={{ fontSize: '14px', color: theme.textMuted, margin: '0 0 24px 0' }}>ניהול ומעקב משימות ופרויקטים</p>

          {authError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'right' }}>⚠️ {authError}</div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textMain, marginBottom: '6px' }}>שם משתמש</label>
              <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="הזן שם משתמש..." autoFocus style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textMain, marginBottom: '6px' }}>סיסמה</label>
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="הזן סיסמה..." style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '4px' }}>התחבר למערכת</button>
          </form>
        </div>
      </div>
    );
  }

  // --- המשך המערכת ---
  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '24px 16px', direction: 'rtl', fontFamily: FONT_FAMILY }}>
      {/* כאן יבוא כל ה-Header והתצוגות */}
      <header>...</header>
    </div>
  );
}
