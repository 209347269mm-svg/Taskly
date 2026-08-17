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
  const userRole = 'מנהל';
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');

  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'calendar' | 'dashboard'>('table');
  const [currentTab, setCurrentTab] = useState<'active' | 'archived' | 'trash'>('active');
  
  const [selectedProjectFilters, setSelectedProjectFilters] = useState<string[]>(['הכל']);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>(['הכל']);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const [selectedPriorityFilters, setSelectedPriorityFilters] = useState<string[]>(['הכל']);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

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
  
  const [activeSubTaskAddingId, setActiveSubTaskAddingId] = useState<string | null>(null);
  const [subTaskTextInputs, setSubTaskTextInputs] = useState<{ [taskId: string]: string }>({});

  const [editingNote, setEditingNote] = useState<{ taskId: string; noteId: string; text: string } | null>(null);

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
            time: n.time || ''
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
    const username = nameInput.trim();
    if (!username) {
      setAuthError('נא להזין שם משתמש.');
      return;
    }
    localStorage.setItem('taskly_user', username);
    localStorage.setItem('taskly_role', 'מנהל');
    setCurrentUser(username);
    setNameInput('');
  };

  const handleLogout = () => {
    localStorage.removeItem('taskly_user');
    localStorage.removeItem('taskly_role');
    setCurrentUser(null);
    setAuthError('');
    setIsUserMenuOpen(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (!window.confirm(`האם למחוק את הפרויקט "${projectName}"?`)) return;
    await deleteDoc(doc(db, 'projects_list', projectId));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    await updateDoc(doc(db, 'tasks', editingTask.id), {
      project: editingTask.project,
      topic: editingTask.topic || '',
      description: editingTask.description,
      assignee: editingTask.assignee || '',
      dueDate: editingTask.dueDate || '',
      priority: editingTask.priority,
      status: editingTask.status
    });
    setEditingTask(null);
  };

  const handleDuplicateTask = async (task: Task) => {
    try {
      await addDoc(collection(db, 'tasks'), {
        project: task.project,
        topic: task.topic,
        description: task.description,
        assignee: task.assignee,
        startDate: new Date().toISOString().split('T')[0],
        dueDate: task.dueDate,
        completedDate: '',
        delays: 0,
        priority: task.priority,
        isArchived: false,
        isDeleted: false,
        status: 'פתוח',
        orderIndex: Date.now(),
        notes: [],
        subtasks: task.subtasks || [],
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert('שגיאה בשכפול המשימה.');
    }
  };

  const handleToggleArchive = async (taskId: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        isArchived: !currentValue,
        isDeleted: false
      });
    } catch (err) {
      console.error(err);
      alert('שגיאה בעדכון הארכיון.');
    }
  };

  const handleToggleTrash = async (taskId: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        isDeleted: !currentValue,
        isArchived: false
      });
    } catch (err) {
      console.error(err);
      alert('שגיאה בעדכון סל המחזור.');
    }
  };

  const handlePermanentDelete = async (taskId: string) => {
    if (!window.confirm("למחוק משימה זו לצמיתות?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error(err);
      alert('שגיאה במחיקת המשימה לצמיתות.');
    }
  };

  // הערות
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

  const handleDeleteNote = async (taskId: string, noteId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newNotes = task.notes.filter(n => n.id !== noteId);
    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
  };

  const handleUpdateNote = async (taskId: string, noteId: string) => {
    if (!editingNote || editingNote.noteId !== noteId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newNotes = task.notes.map(n => n.id === noteId ? { ...n, text: editingNote.text } : n);
    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setEditingNote(null);
  };

  // תת-משימות
  const handleAddSubTask = async (taskId: string) => {
    const text = subTaskTextInputs[taskId]?.trim();
    if (!text) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newSubtasks = [...(task.subtasks || []), {
      id: `sub_${Date.now()}`,
      text,
      completed: false
    }];

    await updateDoc(doc(db, 'tasks', taskId), { subtasks: newSubtasks });
    setSubTaskTextInputs({ ...subTaskTextInputs, [taskId]: '' });
    setActiveSubTaskAddingId(null);
  };

  const handleToggleSubTask = async (taskId: string, subId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newSubtasks = task.subtasks.map(s => s.id === subId ? { ...s, completed: !s.completed } : s);
    await updateDoc(doc(db, 'tasks', taskId), { subtasks: newSubtasks });
  };

  const handleDeleteSubTask = async (taskId: string, subId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newSubtasks = task.subtasks.filter(s => s.id !== subId);
    await updateDoc(doc(db, 'tasks', taskId), { subtasks: newSubtasks });
  };

  // שינוי סטטוס - אם הושלם, עובר אוטומטית לארכיון
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

    const updateData: any = {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : '',
      notes: [...(task?.notes || []), auditNote]
    };

    if (newStatus === 'הושלם') {
      updateData.isArchived = true;
    }

    await updateDoc(doc(db, 'tasks', taskId), updateData);
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

  const handleExecuteWhatsAppSend = () => {
    const relevant = tasks.filter((t) => selectedTaskIdsForWhatsApp.includes(t.id));
    if (relevant.length === 0) {
      alert("לא נבחרו משימות לשיתוף.");
      return;
    }
    let text = `📋 *סיכום משימות נבחרות*\n\n`;
    relevant.forEach((t, idx) => {
      text += `${idx + 1}. *[פרויקט: ${t.project}]* ${t.topic ? `(${t.topic}) ` : ''}- ${t.description}\n`;
      text += `   👤 אחראי: ${t.assignee ? t.assignee.replace(/\n/g, ', ') : 'ללא אחראי'} | 📅 יעד: ${t.dueDate || 'ללא יעד'} | סטטוס: ${t.status}\n\n`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setShowWhatsAppModal(false);
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
      
      const matchProject = selectedProjectFilters.includes('הכל') || selectedProjectFilters.includes(t.project);
      const matchStatus = selectedStatusFilters.includes('הכל') || selectedStatusFilters.includes(t.status);
      const matchPriority = selectedPriorityFilters.includes('הכל') || selectedPriorityFilters.includes(t.priority);

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
  }, [tasks, currentTab, selectedProjectFilters, selectedStatusFilters, selectedPriorityFilters, searchTerm, sortBy, sortOrder]);

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

  const dashboardMetrics = useMemo(() => {
    const active = tasks.filter((t) => !t.isDeleted && !t.isArchived);
    const assigneeLoad: { [key: string]: number } = {};
    active.forEach((t) => {
      if (!t.assignee) return;
      t.assignee.split('\n').map(n => n.trim()).filter(Boolean).forEach(name => {
        assigneeLoad[name] = (assigneeLoad[name] || 0) + 1;
      });
    });

    const projectDelays: { [key: string]: { totalDelay: number; count: number } } = {};
    active.forEach((t) => {
      if (!projectDelays[t.project]) projectDelays[t.project] = { totalDelay: 0, count: 0 };
      const delay = calculateDelayDays(t.dueDate, t.status, t.completedDate);
      if (delay > 0) {
        projectDelays[t.project].totalDelay += delay;
        projectDelays[t.project].count += 1;
      }
    });
    return { assigneeLoad, projectDelays };
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

  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: '20px', direction: 'rtl', fontFamily: FONT_FAMILY, transition: 'background-color 0.2s', position: 'relative' }}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" />
        
        <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ position: 'absolute', top: '20px', right: '20px', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
          {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
        </button>

        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: theme.cardBg, borderRadius: '24px', padding: '36px 28px', border: `1px solid ${theme.border}`, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)', textAlign: 'center' }}>
          
          <div style={{ width: '60px', height: '60px', backgroundColor: '#2563eb', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px', boxShadow: '0 8px 20px -4px rgba(37,99,235,0.5)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '25px', fontWeight: '900', color: theme.textMain, margin: '0 0 6px 0' }}>כניסה למערכת</h2>
          <p style={{ fontSize: '14px', color: theme.textMuted, margin: '0 0 24px 0', fontWeight: '500' }}>ניהול ומעקב משימות ופרויקטים</p>

          {authError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'right' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textMain, marginBottom: '6px' }}>
                שם משתמש
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הזן שם משתמש..."
                autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '4px', boxShadow: '0 4px 12px rgba(37,99,235,0.4)', fontFamily: 'inherit' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '24px 16px', direction: 'rtl', fontFamily: FONT_FAMILY, transition: 'background-color 0.2s' }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" />

      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        
        {/* Header ראשי */}
        <header style={{ backgroundColor: theme.cardBg, borderRadius: '18px', padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', backgroundColor: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>⚡</div>
              <div>
                <h1 style={{ fontSize: '21px', fontWeight: '900', color: theme.textMain, margin: 0 }}>Taskly</h1>
                <span style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '500' }}>ניהול ומעקב משימות</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
              </button>
              <button onClick={handleExportCSV} style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #10b981', backgroundColor: isDarkMode ? '#064e3b' : '#ecfdf5', color: '#10b981', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                📊 ייצוא Excel
              </button>
              <button onClick={() => { const activeTasks = tasks.filter((t) => !t.isDeleted && !t.isArchived); setSelectedTaskIdsForWhatsApp(activeTasks.map(t => t.id)); setShowWhatsAppModal(true); }} style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #25d366', backgroundColor: isDarkMode ? '#064e3b' : '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                💬 WhatsApp
              </button>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: theme.subCardBg, borderRadius: '12px', border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontWeight: '800', color: theme.textMain, fontSize: '14px' }}>{currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>מנהל</span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>▼</span>
            </button>

            {isUserMenuOpen && (
              <div style={{ position: 'absolute', left: 0, top: '115%', width: '180px', backgroundColor: theme.cardBg, borderRadius: '12px', border: `1px solid ${theme.border}`, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', padding: '6px', zIndex: 100 }}>
                <button onClick={handleLogout} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '13px', fontWeight: '700', textAlign: 'right', cursor: 'pointer' }}>🚪 יציאה מהמערכת</button>
              </div>
            )}
          </div>
        </header>

        {/* מודאל וואטסאפ */}
        {showWhatsAppModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>💬 בחירת משימות לשיתוף בוואטסאפ</h3>
                <button onClick={() => setShowWhatsAppModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: theme.textMuted }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '40vh' }}>
                {tasks.filter(t => !t.isDeleted && !t.isArchived).map((t) => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '10px', backgroundColor: theme.subCardBg, cursor: 'pointer', border: `1px solid ${theme.border}` }}>
                    <input type="checkbox" checked={selectedTaskIdsForWhatsApp.includes(t.id)} onChange={(e) => { if (e.target.checked) setSelectedTaskIdsForWhatsApp([...selectedTaskIdsForWhatsApp, t.id]); else setSelectedTaskIdsForWhatsApp(selectedTaskIdsForWhatsApp.filter(id => id !== t.id)); }} />
                    <div style={{ fontSize: '13px', flex: 1 }}>[{t.project}] {t.description}</div>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleExecuteWhatsAppSend} style={{ flex: 1, padding: '12px', backgroundColor: '#25d366', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>שלח בוואטסאפ</button>
                <button onClick={() => setShowWhatsAppModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* מודאל עריכת משימה */}
        {editingTask && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '520px', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 18px 0', fontSize: '20px', fontWeight: '800' }}>עריכת משימה</h3>
              <form onSubmit={handleSaveEditedTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור המשימה</label>
                  <textarea value={editingTask.description} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} rows={3} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>אחראים</label>
                  <textarea value={editingTask.assignee} onChange={(e) => setEditingTask({ ...editingTask, assignee: e.target.value })} rows={2} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תאריך יעד</label>
                    <input type="date" value={editingTask.dueDate} onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות</label>
                    <select value={editingTask.priority} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as any })} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }}>
                      <option value="גבוהה">גבוהה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="נמוכה">נמוכה</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>שמור שינויים</button>
                  <button type="button" onClick={() => setEditingTask(null)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>ביטול</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* שורת סינונים עליונה (פרויקטים מרובים באמצעות תיבות סימון) */}
        <div style={{ backgroundColor: theme.cardBg, borderRadius: '16px', padding: '16px 20px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
              <span style={{ fontSize: '14px', fontWeight: '800' }}>📁 סינון פרויקטים:</span>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  style={{ padding: '10px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {selectedProjectFilters.includes('הכל') ? 'כל הפרויקטים' : `נבחרו ${selectedProjectFilters.length} פרויקטים`} ▾
                </button>

                {isProjectDropdownOpen && (
                  <div style={{ position: 'absolute', top: '115%', right: 0, backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', padding: '12px', zIndex: 50, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedProjectFilters.includes('הכל')}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedProjectFilters(['הכל']);
                        }}
                      />
                      הצג הכל
                    </label>
                    <hr style={{ borderColor: theme.border, margin: '4px 0' }} />
                    {allProjectNames.map((pName) => (
                      <label key={pName} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedProjectFilters.includes(pName)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const updated = selectedProjectFilters.includes('הכל') ? [pName] : [...selectedProjectFilters, pName];
                              setSelectedProjectFilters(updated);
                            } else {
                              const updated = selectedProjectFilters.filter(p => p !== pName);
                              setSelectedProjectFilters(updated.length === 0 ? ['הכל'] : updated);
                            }
                          }}
                        />
                        {pName}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', backgroundColor: theme.subCardBg, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}` }}>
                <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'table' ? '#2563eb' : 'transparent', color: viewMode === 'table' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📊 טבלה</button>
                <button onClick={() => setViewMode('cards')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'cards' ? '#2563eb' : 'transparent', color: viewMode === 'cards' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>🗂️ כרטיסיות</button>
                <button onClick={() => setViewMode('calendar')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'calendar' ? '#2563eb' : 'transparent', color: viewMode === 'calendar' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📅 יומן</button>
                <button onClick={() => setViewMode('dashboard')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'dashboard' ? '#2563eb' : 'transparent', color: viewMode === 'dashboard' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📊 דשבורד</button>
              </div>

              <button onClick={() => setShowAddProjectModal(true)} style={{ padding: '8px 16px', backgroundColor: '#2563eb', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', color: '#ffffff', cursor: 'pointer' }}>+ פרויקט חדש</button>
            </div>
          </div>
        </div>

        {/* טאבים ראשיים */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setCurrentTab('active')} style={{ padding: '10px 18px', borderRadius: '12px', border: currentTab === 'active' ? '1.5px solid #2563eb' : `1px solid ${theme.border}`, backgroundColor: currentTab === 'active' ? (isDarkMode ? '#1e3a8a' : '#eff6ff') : theme.cardBg, color: currentTab === 'active' ? '#2563eb' : theme.textMain, fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}>📋 משימות פעילות ({counts.active})</button>
            <button onClick={() => setCurrentTab('archived')} style={{ padding: '10px 18px', borderRadius: '12px', border: currentTab === 'archived' ? '1.5px solid #d97706' : `1px solid ${theme.border}`, backgroundColor: currentTab === 'archived' ? (isDarkMode ? '#451a03' : '#fef3c7') : theme.cardBg, color: currentTab === 'archived' ? '#d97706' : theme.textMain, fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}>📦 ארכיון ({counts.archived})</button>
            <button onClick={() => setCurrentTab('trash')} style={{ padding: '10px 18px', borderRadius: '12px', border: currentTab === 'trash' ? '1.5px solid #dc2626' : `1px solid ${theme.border}`, backgroundColor: currentTab === 'trash' ? (isDarkMode ? '#450a0a' : '#fee2e2') : theme.cardBg, color: currentTab === 'trash' ? '#dc2626' : theme.textMain, fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}>🗑️ סל מחזור ({counts.trash})</button>
          </div>
        </div>

        {/* שורת חיפוש וסינונים (סטטוסים ועדיפויות עם תיבות סימון) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="חיפוש משימה, אחראי, נושא..." style={{ flex: 1, minWidth: '200px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none' }} />
          
          {/* סטטוסים מרובים */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {selectedStatusFilters.includes('הכל') ? 'כל הסטטוסים' : `סטטוסים (${selectedStatusFilters.length})`} ▾
            </button>
            {isStatusDropdownOpen && (
              <div style={{ position: 'absolute', top: '115%', right: 0, backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', padding: '12px', zIndex: 50, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedStatusFilters.includes('הכל')} onChange={(e) => { if (e.target.checked) setSelectedStatusFilters(['הכל']); }} />
                  כל הסטטוסים
                </label>
                <hr style={{ borderColor: theme.border, margin: '4px 0' }} />
                {['פתוח', 'בביצוע', 'הושלם', 'נדחה'].map((st) => (
                  <label key={st} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedStatusFilters.includes(st)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const updated = selectedStatusFilters.includes('הכל') ? [st] : [...selectedStatusFilters, st];
                          setSelectedStatusFilters(updated);
                        } else {
                          const updated = selectedStatusFilters.filter(s => s !== st);
                          setSelectedStatusFilters(updated.length === 0 ? ['הכל'] : updated);
                        }
                      }}
                    />
                    {st}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* עדיפויות מרובות */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
              style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {selectedPriorityFilters.includes('הכל') ? 'כל העדיפויות' : `עדיפויות (${selectedPriorityFilters.length})`} ▾
            </button>
            {isPriorityDropdownOpen && (
              <div style={{ position: 'absolute', top: '115%', right: 0, backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', padding: '12px', zIndex: 50, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedPriorityFilters.includes('הכל')} onChange={(e) => { if (e.target.checked) setSelectedPriorityFilters(['הכל']); }} />
                  כל העדיפויות
                </label>
                <hr style={{ borderColor: theme.border, margin: '4px 0' }} />
                {['גבוהה', 'בינונית', 'נמוכה'].map((pr) => (
                  <label key={pr} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedPriorityFilters.includes(pr)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const updated = selectedPriorityFilters.includes('הכל') ? [pr] : [...selectedPriorityFilters, pr];
                          setSelectedPriorityFilters(updated);
                        } else {
                          const updated = selectedPriorityFilters.filter(p => p !== pr);
                          setSelectedPriorityFilters(updated.length === 0 ? ['הכל'] : updated);
                        }
                      }}
                    />
                    {pr}
                  </label>
                ))}
              </div>
            )}
          </div>

          {currentTab === 'active' && (
            <button onClick={() => setShowAddTaskModal(true)} style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}>+ משימה חדשה</button>
          )}
        </div>

        {/* מודאל פרויקט חדש */}
        {showAddProjectModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: '800' }}>הוספת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input type="text" value={newProjectNameInput} onChange={(e) => setNewProjectNameInput(e.target.value)} placeholder="שם הפרויקט החדש" autoFocus style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>צור</button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>ביטול</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל משימה חדשה */}
        {showAddTaskModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '520px', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 18px 0', fontSize: '20px', fontWeight: '800' }}>הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>פרויקט</label>
                  <select value={newProject} onChange={(e) => setNewProject(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }}>
                    {allProjectNames.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>נושא / תת-נושא</label>
                  <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="למשל: תוכנה, חומרה" style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור המשימה</label>
                  <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="מה נדרש לבצע?" rows={3} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>אחראים - כל שם בשורה נפרדת</label>
                  <textarea value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} placeholder="שמות האחראים..." rows={2} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תאריך יעד</label>
                    <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות</label>
                    <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)} style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText }}>
                      <option value="גבוהה">גבוהה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="נמוכה">נמוכה</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>שמור</button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>ביטול</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* תצוגת דשבורד מעוצבת */}
        {viewMode === 'dashboard' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            <div style={{ backgroundColor: theme.cardBg, borderRadius: '20px', padding: '24px', border: `1px solid ${theme.border}` }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: theme.textMain }}>👥 עומס משימות לפי אחראי</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.keys(dashboardMetrics.assigneeLoad).length === 0 ? (
                  <p style={{ color: theme.textMuted, fontSize: '13px' }}>אין משימות משויכות לאחראים כרגע.</p>
                ) : (
                  Object.entries(dashboardMetrics.assigneeLoad).map(([name, count]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: theme.subCardBg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                      <span style={{ fontWeight: '700', fontSize: '14px' }}>👤 {name}</span>
                      <span style={{ backgroundColor: '#2563eb', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>{count} משימות</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ backgroundColor: theme.cardBg, borderRadius: '20px', padding: '24px', border: `1px solid ${theme.border}` }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: theme.textMain }}>⏱️ איחורים ממוצעים לפי פרויקט</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.keys(dashboardMetrics.projectDelays).length === 0 ? (
                  <p style={{ color: theme.textMuted, fontSize: '13px' }}>אין איחורים בפרויקטים.</p>
                ) : (
                  Object.entries(dashboardMetrics.projectDelays).map(([pName, val]) => {
                    const avg = Math.round(val.totalDelay / (val.count || 1));
                    return (
                      <div key={pName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: theme.subCardBg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                        <span style={{ fontWeight: '700', fontSize: '14px' }}>📁 {pName}</span>
                        <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>ממוצע {avg} ימי איחור</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'calendar' ? (
          
          /* תצוגת יומן חודשי אינטראקטיבי */
          <div style={{ backgroundColor: theme.cardBg, borderRadius: '20px', padding: '24px', border: `1px solid ${theme.border}`, marginBottom: '28px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: theme.textMain }}>📅 לוח משימות חודשי לפי תאריך יעד</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: '10px' }}>
              {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'].map((d) => (
                <div key={d} style={{ textAlign: 'center', fontWeight: 'bold', padding: '10px', backgroundColor: theme.subCardBg, borderRadius: '8px', color: theme.textMuted, fontSize: '13px' }}>
                  יום {d}
                </div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const dayStr = dayNum.toString().padStart(2, '0');
                const matchingTasks = filteredTasks.filter((t) => t.dueDate && t.dueDate.endsWith(`-${dayStr}`));

                return (
                  <div key={i} style={{ minHeight: '110px', backgroundColor: theme.subCardBg, borderRadius: '12px', padding: '10px', border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textMuted }}>{dayNum} לחודש</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '90px' }}>
                      {matchingTasks.map((t) => (
                        <div key={t.id} style={{ fontSize: '11px', padding: '4px 6px', borderRadius: '6px', backgroundColor: getProjectColor(t.project), color: '#fff', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                          [{t.project}] {t.description}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          
          /* תצוגת טבלה או כרטיסיות (מציגה רק פרויקטים שיש בהם משימות תואמות בעת סינון) */
          allProjectNames
            .filter((p) => {
              const matchSelectedProj = selectedProjectFilters.includes('הכל') || selectedProjectFilters.includes(p);
              const hasTasks = filteredTasks.some(t => t.project === p);
              const isFiltered = !selectedPriorityFilters.includes('הכל') || !selectedStatusFilters.includes('הכל');
              return matchSelectedProj && (isFiltered ? hasTasks : true);
            })
            .map((projectName) => {
              const projectTasks = filteredTasks.filter((t) => t.project === projectName);
              const projectDoc = projects.find((p) => p.name === projectName);
              const pColor = getProjectColor(projectName);

              if (projectTasks.length === 0 && currentTab !== 'active') return null;

              return (
                <div key={projectName} style={{ backgroundColor: theme.cardBg, borderRadius: '20px', border: `1px solid ${theme.border}`, overflow: 'hidden', marginBottom: '28px' }}>
                  
                  <div style={{ backgroundColor: isDarkMode ? '#0f172a' : '#1e293b', borderTop: `4px solid ${pColor}`, color: '#ffffff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ backgroundColor: pColor, padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>פרויקט</span>
                      <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                      <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '12px' }}>{projectTasks.length} משימות</span>
                    </div>

                    {projectDoc && currentTab === 'active' && (
                      <button onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>🗑️ מחק פרויקט</button>
                    )}
                  </div>

                  {projectTasks.length === 0 ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>אין משימות להצגה בפרויקט זה תחת הסינון הנוכחי.</div>
                  ) : viewMode === 'table' ? (
                    
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '1350px' }}>
                        <thead>
                          <tr style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderBottom: `1.5px solid ${theme.border}`, color: theme.textMuted }}>
                            <th style={{ width: '30px' }}></th>
                            <th style={{ padding: '14px 16px', width: '110px' }}>נושא</th>
                            <th style={{ padding: '14px 16px', minWidth: '260px' }}>תיאור המשימה ותת-משימות</th>
                            <th style={{ padding: '14px 12px', width: '130px' }}>אחראים</th>
                            <th onClick={() => handleSort('priority')} style={{ padding: '14px 10px', width: '85px', cursor: 'pointer' }}>עדיפות ↕</th>
                            <th style={{ padding: '14px 12px', width: '95px' }}>פתיחה</th>
                            <th onClick={() => handleSort('dueDate')} style={{ padding: '14px 12px', width: '105px', cursor: 'pointer' }}>תאריך יעד ↕</th>
                            <th style={{ padding: '14px 12px', width: '105px' }}>השלמה</th>
                            <th onClick={() => handleSort('delays')} style={{ padding: '14px 10px', width: '95px', textAlign: 'center', cursor: 'pointer' }}>דחיות ↕</th>
                            <th style={{ padding: '14px 10px', width: '85px', textAlign: 'center' }}>איחור</th>
                            <th style={{ padding: '14px 14px', width: '110px' }}>סטטוס</th>
                            <th style={{ padding: '14px 16px', minWidth: '280px' }}>הערות</th>
                            <th style={{ padding: '14px 12px', width: '120px', textAlign: 'center' }}>פעולות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectTasks.map((t) => {
                            const delayDays = calculateDelayDays(t.dueDate, t.status, t.completedDate);
                            const dueSoon = isDueSoon(t.dueDate, t.status);
                            const isCompleted = t.status === 'הושלם';

                            return (
                              <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: isCompleted ? (isDarkMode ? '#131d2e' : '#fafafa') : dueSoon ? (isDarkMode ? '#422006' : '#fefce8') : 'transparent', verticalAlign: 'top' }}>
                                <td style={{ padding: '14px 6px', textAlign: 'center', opacity: 0.5 }}>⋮⋮</td>
                                <td style={{ padding: '14px 16px', fontWeight: '800', color: pColor }}>
                                  {t.topic ? <span style={{ backgroundColor: `${pColor}15`, padding: '4px 8px', borderRadius: '6px' }}>{t.topic}</span> : <span style={{ color: theme.textMuted }}>-</span>}
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  <div style={{ fontWeight: '600', color: isCompleted ? theme.textMuted : theme.textMain, textDecoration: isCompleted ? 'line-through' : 'none', marginBottom: '6px' }}>
                                    {t.description}
                                  </div>

                                  {/* רשימת תת-משימות */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
                                    {(t.subtasks || []).map((sub) => (
                                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', backgroundColor: theme.cardBg, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', textDecoration: sub.completed ? 'line-through' : 'none', color: sub.completed ? theme.textMuted : theme.textMain }}>
                                          <input type="checkbox" checked={sub.completed} onChange={() => handleToggleSubTask(t.id, sub.id)} />
                                          {sub.text}
                                        </label>
                                        <button onClick={() => handleDeleteSubTask(t.id, sub.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* כפתור פלוס לקובץ תת-משימה */}
                                  <div>
                                    {activeSubTaskAddingId === t.id ? (
                                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                                        <input
                                          type="text"
                                          value={subTaskTextInputs[t.id] || ''}
                                          onChange={(e) => setSubTaskTextInputs({ ...subTaskTextInputs, [t.id]: e.target.value })}
                                          placeholder="הקלד תת-משימה..."
                                          autoFocus
                                          style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '11px' }}
                                          onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask(t.id)}
                                        />
                                        <button onClick={() => handleAddSubTask(t.id)} style={{ padding: '4px 8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>הוסף</button>
                                        <button onClick={() => setActiveSubTaskAddingId(null)} style={{ padding: '4px 6px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>ביטול</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setActiveSubTaskAddingId(t.id)}
                                        style={{ background: 'none', border: '1px dashed #2563eb', color: '#2563eb', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        + הוסף תת-משימה
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '14px 12px' }}>
                                  {t.assignee ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      {t.assignee.split('\n').map((name, i) => name.trim() ? <span key={i} style={{ backgroundColor: theme.subCardBg, padding: '3px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', width: 'fit-content' }}>👤 {name.trim()}</span> : null)}
                                    </div>
                                  ) : <span style={{ color: theme.textMuted }}>-</span>}
                                </td>
                                <td style={{ padding: '14px 10px' }}>
                                  <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', backgroundColor: t.priority === 'גבוהה' ? '#fee2e2' : t.priority === 'בינונית' ? '#ffedd5' : '#dcfce7', color: t.priority === 'גבוהה' ? '#dc2626' : t.priority === 'בינונית' ? '#ea580c' : '#16a34a' }}>{t.priority}</span>
                                </td>
                                <td style={{ padding: '14px 12px', color: theme.textMuted, fontSize: '12px' }}>{t.startDate}</td>
                                <td style={{ padding: '14px 12px', fontWeight: '700', fontSize: '12px' }}>{t.dueDate ? `📅 ${t.dueDate}` : '-'}</td>
                                <td style={{ padding: '14px 12px', color: t.completedDate ? '#16a34a' : theme.textMuted, fontWeight: '700', fontSize: '12px' }}>{t.completedDate ? `✓ ${t.completedDate}` : '-'}</td>
                                <td style={{ padding: '14px 10px', textAlign: 'center' }}>{t.delays || 0}</td>
                                <td style={{ padding: '14px 10px', textAlign: 'center' }}>{delayDays > 0 ? <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontWeight: '800' }}>{delayDays} ימים</span> : '-'}</td>
                                <td style={{ padding: '14px 14px' }}>
                                  <select value={t.status} onChange={(e) => handleStatusChange(t.id, e.target.value as any)} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '800', backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'נדחה' ? '#fee2e2' : '#e0f2fe', color: t.status === 'הושלם' ? '#166534' : t.status === 'נדחה' ? '#b91c1c' : '#0369a1' }}>
                                    <option value="פתוח">פתוח</option>
                                    <option value="בביצוע">בביצוע</option>
                                    <option value="הושלם">הושלם (ארכיון)</option>
                                    <option value="נדחה">נדחה</option>
                                  </select>
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  {(t.notes || []).map((n) => (
                                    <div key={n.id} style={{ fontSize: '12px', backgroundColor: theme.subCardBg, padding: '8px 10px', borderRadius: '8px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span><b>{n.author}:</b></span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => setEditingNote({ taskId: t.id, noteId: n.id, text: n.text })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }} title="ערוך">✏️</button>
                                          <button onClick={() => handleDeleteNote(t.id, n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#ef4444' }} title="מחק">🗑️</button>
                                        </div>
                                      </div>

                                      {editingNote?.taskId === t.id && editingNote?.noteId === n.id ? (
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                          <input
                                            type="text"
                                            value={editingNote.text}
                                            onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                                            style={{ flex: 1, padding: '4px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '11px' }}
                                          />
                                          <button onClick={() => handleUpdateNote(t.id, n.id)} style={{ padding: '4px 8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>שמור</button>
                                          <button onClick={() => setEditingNote(null)} style={{ padding: '4px 8px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>ביטול</button>
                                        </div>
                                      ) : (
                                        <span style={{ color: theme.textMain }}>{n.text}</span>
                                      )}
                                    </div>
                                  ))}

                                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                                    <input type="text" value={noteInputs[t.id] || ''} onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })} placeholder="הוסף הערה..." style={{ flex: 1, padding: '6px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '12px' }} onKeyDown={(e) => e.key === 'Enter' && handleAddNote(t.id)} />
                                    <button onClick={() => handleAddNote(t.id)} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>שלח</button>
                                  </div>
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    {currentTab === 'archived' ? (
                                      <>
                                        <button onClick={() => handleToggleArchive(t.id, t.isArchived)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }} title="הוצא מארכיון">החזר לפעיל</button>
                                        <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }} title="העבר לסל מחזור">מחק</button>
                                      </>
                                    ) : currentTab === 'trash' ? (
                                      <>
                                        <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }} title="שחזר משימה">שחזר</button>
                                        <button onClick={() => handlePermanentDelete(t.id)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }} title="מחק לצמיתות">מחק</button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => handleDuplicateTask(t)} style={{ padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }} title="שכפל משימה">📋</button>
                                        <button onClick={() => setEditingTask(t)} style={{ padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }} title="ערוך משימה">✏️</button>
                                        <button onClick={() => handleToggleArchive(t.id, t.isArchived)} style={{ padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }} title="העבר לארכיון">📦</button>
                                        <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 6px', borderRadius: '6px', color: '#dc2626', cursor: 'pointer' }} title="העבר לסל מחזור">🗑️</button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    
                    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                      {projectTasks.map((t) => {
                        const isCompleted = t.status === 'הושלם';
                        return (
                          <div key={t.id} style={{ backgroundColor: theme.subCardBg, border: `1.5px solid ${theme.border}`, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ backgroundColor: `${pColor}15`, color: pColor, fontWeight: '800', fontSize: '12px', padding: '3px 8px', borderRadius: '6px' }}>{t.topic || 'כללי'}</span>
                              <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800', backgroundColor: t.priority === 'גבוהה' ? '#fee2e2' : t.priority === 'בינונית' ? '#ffedd5' : '#dcfce7', color: t.priority === 'גבוהה' ? '#dc2626' : t.priority === 'בינונית' ? '#ea580c' : '#16a34a' }}>{t.priority}</span>
                            </div>

                            <div style={{ fontSize: '15px', fontWeight: '700', textDecoration: isCompleted ? 'line-through' : 'none' }}>{t.description}</div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: theme.textMuted }}>
                              {t.assignee && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: theme.cardBg, padding: '4px 8px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                                  {t.assignee.split('\n').map((name, i) => name.trim() ? <span key={i} style={{ fontWeight: '700', color: theme.textMain }}>👤 {name.trim()}</span> : null)}
                                </div>
                              )}
                              {t.dueDate && <span>📅 יעד: {t.dueDate}</span>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                              <select value={t.status} onChange={(e) => handleStatusChange(t.id, e.target.value as any)} style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: '800', backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'נדחה' ? '#fee2e2' : '#e0f2fe', color: t.status === 'הושלם' ? '#166534' : t.status === 'נדחה' ? '#b91c1c' : '#0369a1' }}>
                                <option value="פתוח">פתוח</option>
                                <option value="בביצוע">בביצוע</option>
                                <option value="הושלם">הושלם</option>
                                <option value="נדחה">נדחה</option>
                              </select>

                              <div style={{ display: 'flex', gap: '6px' }}>
                                {currentTab === 'archived' ? (
                                  <>
                                    <button onClick={() => handleToggleArchive(t.id, t.isArchived)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>החזר</button>
                                    <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>מחק</button>
                                  </>
                                ) : currentTab === 'trash' ? (
                                  <>
                                    <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>שחזר</button>
                                    <button onClick={() => handlePermanentDelete(t.id)} style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>מחק</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => handleDuplicateTask(t)} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }} title="שכפל">📋</button>
                                    <button onClick={() => setEditingTask(t)} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }} title="ערוך">✏️</button>
                                    <button onClick={() => handleToggleArchive(t.id, t.isArchived)} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }} title="ארכיון">📦</button>
                                    <button onClick={() => handleToggleTrash(t.id, t.isDeleted)} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }} title="מחק">🗑️</button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })
        )}

      </div>
    </div>
  );
}
