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
  priority: 'נמוכה' | 'בינונית' | 'דחופה' | 'קריטית';
  isArchived: boolean;
  status: 'פתוח' | 'בביצוע' | 'הושלם';
  notes: NoteItem[];
}

interface ProjectDoc {
  id: string;
  name: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [userRole, setUserRole] = useState<'משתמש' | 'מנהל'>(() => (localStorage.getItem('taskly_role') as any) || 'משתמש');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');

  // התחברות
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');
  const [authError, setAuthError] = useState('');

  // סיסמת מנהל
  const [adminPassword, setAdminPassword] = useState('1234');
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  // תצוגה וסינון
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('הכל');
  const [priorityFilter, setPriorityFilter] = useState<string>('הכל');
  const [showArchivedView, setShowArchivedView] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // מודאלים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectDoc | null>(null);
  const [editingProjectNewName, setEditingProjectNewName] = useState('');

  // משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'נמוכה' | 'בינונית' | 'דחופה' | 'קריטית'>('בינונית');
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  // הערות
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});
  const [editingNote, setEditingNote] = useState<{ taskId: string; noteId: string; text: string } | null>(null);

  // ערכת נושא
  useEffect(() => {
    localStorage.setItem('taskly_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // חיבור אנונימי
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // סנכרון סיסמת מנהל
  useEffect(() => {
    const docRef = doc(db, 'settings', 'admin_config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.adminPassword) {
          setAdminPassword(data.adminPassword);
        }
      } else {
        setDoc(docRef, { adminPassword: '1234' }).catch((err) => console.error("Default pass error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // טעינת פרויקטים
  useEffect(() => {
    const q = query(collection(db, 'projects_list'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string
      }));
      setProjects(fetched);
      if (fetched.length > 0 && !newProject) {
        setNewProject(fetched[0].name);
      }
    }, (err) => console.error("Projects error:", err));
    return () => unsubscribe();
  }, []);

  // טעינת משימות
  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('startDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Task[] = snapshot.docs.map((d) => {
        const data = d.data() as any;
        const notesWithId = (data.notes || []).map((n: any, idx: number) => ({
          id: n.id || `note_${idx}_${Date.now()}`,
          text: n.text || '',
          author: n.author || 'אורח',
          time: n.time || ''
        }));

        return {
          id: d.id,
          project: data.project || 'כללי',
          topic: data.topic || 'כללי',
          description: data.description || '',
          assignee: data.assignee || 'ללא אחראי',
          startDate: data.startDate || '',
          dueDate: data.dueDate || '',
          completedDate: data.completedDate || '',
          delays: data.delays || 0,
          priority: data.priority || 'בינונית',
          isArchived: data.isArchived || false,
          status: data.status || 'פתוח',
          notes: notesWithId
        };
      });
      setTasks(fetched);
    }, (err) => console.error("Tasks error:", err));
    return () => unsubscribe();
  }, []);

  // חישוב ימי איחור
  const calculateDelayDays = (dueDate: string, status: string, completedDate?: string) => {
    if (!dueDate) return 0;
    const due = new Date(dueDate).getTime();
    const end = status === 'הושלם' && completedDate ? new Date(completedDate).getTime() : new Date().setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((end - due) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // בדיקת יעד קרוב (היום או מחר)
  const isDueSoon = (dueDate: string, status: string) => {
    if (!dueDate || status === 'הושלם') return false;
    const due = new Date(dueDate).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 1;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!nameInput.trim()) {
      setAuthError('נא להזין שם מלא או שם משתמש.');
      return;
    }

    if (roleInput === 'מנהל') {
      if (passwordInput !== adminPassword) {
        setAuthError('סיסמת מנהל שגויה.');
        return;
      }
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
  };

  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newAdminPasswordInput.trim();
    if (!trimmed) return;

    await setDoc(doc(db, 'settings', 'admin_config'), { adminPassword: trimmed }, { merge: true });
    alert('סיסמת המנהל עודכנה בהצלחה!');
    setNewAdminPasswordInput('');
    setShowPasswordChangeModal(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'מנהל') return;
    const trimmed = newProjectNameInput.trim();
    if (!trimmed) return;

    await addDoc(collection(db, 'projects_list'), {
      name: trimmed,
      createdAt: serverTimestamp()
    });

    setNewProject(trimmed);
    setNewProjectNameInput('');
    setShowAddProjectModal(false);
  };

  const handleUpdateProjectName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editingProjectNewName.trim() || userRole !== 'מנהל') return;

    const oldName = editingProject.name;
    const newName = editingProjectNewName.trim();

    // עדכון שם הפרויקט בטבלת הפרויקטים
    await updateDoc(doc(db, 'projects_list', editingProject.id), { name: newName });

    // עדכון כל המשימות השייכות לפרויקט הישן
    tasks.forEach(async (t) => {
      if (t.project === oldName) {
        await updateDoc(doc(db, 'tasks', t.id), { project: newName });
      }
    });

    setEditingProject(null);
    setEditingProjectNewName('');
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (userRole !== 'מנהל') return;
    if (!window.confirm(`האם למחוק את הפרויקט "${projectName}"?`)) return;
    await deleteDoc(doc(db, 'projects_list', projectId));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'מנהל') return;
    if (!newDescription.trim()) return;

    const todayStr = new Date().toISOString().split('T')[0];
    await addDoc(collection(db, 'tasks'), {
      project: newProject || (projects[0]?.name || 'פרויקט כללי'),
      topic: newTopic.trim() || 'כללי',
      description: newDescription.trim(),
      assignee: newAssignee.trim() || currentUser || 'ללא אחראי',
      startDate: todayStr,
      dueDate: newDueDate || todayStr,
      completedDate: '',
      delays: 0,
      priority: newPriority,
      isArchived: false,
      status: 'פתוח',
      notes: [],
      createdAt: serverTimestamp()
    });

    setNewDescription('');
    setNewTopic('');
    setNewDueDate('');
    setShowAddTaskModal(false);
  };

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || userRole !== 'מנהל') return;

    await updateDoc(doc(db, 'tasks', editingTask.id), {
      project: editingTask.project,
      topic: editingTask.topic,
      description: editingTask.description,
      assignee: editingTask.assignee,
      startDate: editingTask.startDate,
      dueDate: editingTask.dueDate,
      completedDate: editingTask.completedDate || '',
      delays: editingTask.delays || 0,
      priority: editingTask.priority,
      status: editingTask.status
    });

    setEditingTask(null);
  };

  // הוספת הערה
  const handleAddNote = async (taskId: string) => {
    const text = noteInputs[taskId]?.trim();
    if (!text) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const fullTimestamp = `${formattedDate} ${formattedTime}`;

    const newNotes = [...(task.notes || []), {
      id: `note_${Date.now()}`,
      text,
      author: currentUser || 'אורח',
      time: fullTimestamp
    }];

    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setNoteInputs({ ...noteInputs, [taskId]: '' });
  };

  // עריכת הערה
  const handleSaveEditedNote = async () => {
    if (!editingNote || !editingNote.text.trim()) return;

    const task = tasks.find((t) => t.id === editingNote.taskId);
    if (!task) return;

    const updatedNotes = (task.notes || []).map((n) =>
      n.id === editingNote.noteId ? { ...n, text: editingNote.text.trim() } : n
    );

    await updateDoc(doc(db, 'tasks', editingNote.taskId), { notes: updatedNotes });
    setEditingNote(null);
  };

  // מחיקת הערה
  const handleDeleteNote = async (taskId: string, noteId: string) => {
    if (!window.confirm("למחוק הערה זו?")) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedNotes = (task.notes || []).filter((n) => n.id !== noteId);
    await updateDoc(doc(db, 'tasks', taskId), { notes: updatedNotes });
  };

  // שינוי סטטוס
  const handleStatusChange = async (taskId: string, newStatus: 'פתוח' | 'בביצוע' | 'הושלם') => {
    const todayStr = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : ''
    });
  };

  const handleIncrementDelay = async (taskId: string, currentDelays: number) => {
    if (userRole !== 'מנהל') return;
    await updateDoc(doc(db, 'tasks', taskId), {
      delays: (currentDelays || 0) + 1
    });
  };

  const handleToggleArchive = async (taskId: string, currentArchived: boolean) => {
    if (userRole !== 'מנהל') return;
    await updateDoc(doc(db, 'tasks', taskId), {
      isArchived: !currentArchived
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (userRole !== 'מנהל') return;
    if (!window.confirm("למחוק משימה זו לצמיתות?")) return;
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  // ייצוא לקובץ Excel (CSV עם UTF-8 BOM)
  const handleExportCSV = () => {
    const activeTasks = tasks.filter((t) => (showArchivedView ? t.isArchived : !t.isArchived));
    if (activeTasks.length === 0) {
      alert("אין נתונים לייצוא.");
      return;
    }

    const headers = ['פרויקט', 'נושא', 'תיאור המשימה', 'אחראי', 'עדיפות', 'תאריך פתיחה', 'תאריך יעד', 'השלמה בפועל', 'דחיות', 'סטטוס', 'הערות'];
    const rows = activeTasks.map((t) => [
      `"${t.project}"`,
      `"${t.topic}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.assignee}"`,
      `"${t.priority}"`,
      `"${t.startDate}"`,
      `"${t.dueDate}"`,
      `"${t.completedDate || ''}"`,
      t.delays || 0,
      `"${t.status}"`,
      `"${(t.notes || []).map((n) => `${n.author} (${n.time}): ${n.text}`).join(' | ').replace(/"/g, '""')}"`
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

  // שיתוף בוואטסאפ
  const handleShareWhatsApp = (projectName?: string) => {
    const relevant = tasks.filter((t) =>
      !t.isArchived &&
      (projectName ? t.project === projectName : selectedProjects.length === 0 || selectedProjects.includes(t.project))
    );

    if (relevant.length === 0) {
      alert("אין משימות פתוחות לשיתוף.");
      return;
    }

    let text = `📋 *סיכום משימות - ${projectName || 'כללי'}*\n`;
    text += `סה"כ: ${relevant.length} משימות\n\n`;

    relevant.forEach((t, idx) => {
      text += `${idx + 1}. *[${t.project}]* ${t.topic} - ${t.description}\n`;
      text += `   👤 אחראי: ${t.assignee} | 📅 יעד: ${t.dueDate} | סטטוס: ${t.status}\n`;
      if (t.notes && t.notes.length > 0) {
        text += `   💬 הערה אחרונה: ${t.notes[t.notes.length - 1].text}\n`;
      }
      text += `\n`;
    });

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const allProjectNames = useMemo(() => {
    return Array.from(new Set([...projects.map((p) => p.name), ...tasks.map((t) => t.project)]));
  }, [projects, tasks]);

  const toggleProjectSelection = (projectName: string) => {
    if (selectedProjects.includes(projectName)) {
      setSelectedProjects(selectedProjects.filter((p) => p !== projectName));
    } else {
      setSelectedProjects([...selectedProjects, projectName]);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchArchive = showArchivedView ? t.isArchived : !t.isArchived;
      const matchProject = selectedProjects.length === 0 || selectedProjects.includes(t.project);
      const matchStatus = statusFilter === 'הכל' || t.status === statusFilter;
      const matchPriority = priorityFilter === 'הכל' || t.priority === priorityFilter;
      const matchSearch = searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      return matchArchive && matchProject && matchStatus && matchPriority && matchSearch;
    });
  }, [tasks, showArchivedView, selectedProjects, statusFilter, priorityFilter, searchTerm]);

  // סגנונות Theme דינמיים
  const theme = {
    bg: isDarkMode ? '#090d16' : '#f8fafc',
    cardBg: isDarkMode ? '#111827' : '#ffffff',
    textMain: isDarkMode ? '#f9fafb' : '#0f172a',
    textMuted: isDarkMode ? '#9ca3af' : '#64748b',
    border: isDarkMode ? '#1f2937' : '#e2e8f0',
    headerBg: isDarkMode ? '#0f172a' : '#ffffff',
    subCardBg: isDarkMode ? '#1e293b' : '#f8fafc',
    inputBg: isDarkMode ? '#1f2937' : '#ffffff',
    inputText: isDarkMode ? '#ffffff' : '#0f172a'
  };

  // מסך התחברות
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090d16', padding: '20px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#111827', borderRadius: '24px', padding: '36px 28px', border: '1px solid #1f2937', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', textAlign: 'center' }}>
          
          <div style={{ width: '60px', height: '60px', backgroundColor: '#2563eb', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px', boxShadow: '0 8px 20px -4px rgba(37,99,235,0.5)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#f9fafb', margin: '0 0 6px 0' }}>כניסה למערכת</h2>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 24px 0' }}>ניהול ומעקב משימות ופרויקטים</p>

          {authError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'right' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '6px' }}>
                שם מלא / כינוי
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הזן את שמך..."
                autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '6px' }}>
                סוג הרשאה
              </label>
              <div style={{ display: 'flex', backgroundColor: '#1f2937', borderRadius: '10px', padding: '4px', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setRoleInput('משתמש')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#2563eb' : 'transparent', color: roleInput === 'משתמש' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  משתמש (צפייה + הערות)
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('מנהל')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#2563eb' : 'transparent', color: roleInput === 'מנהל' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  מנהל (שליטה מלאה)
                </button>
              </div>
            </div>

            {roleInput === 'מנהל' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '6px' }}>
                  סיסמת מנהל
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="הזן סיסמה..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '4px', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '24px 16px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'background-color 0.2s' }}>
      
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        
        {/* Header ראשי */}
        <header style={{ backgroundColor: theme.cardBg, borderRadius: '18px', padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: theme.subCardBg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontWeight: '800', color: theme.textMain, fontSize: '14px' }}>{currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                {userRole === 'מנהל' ? 'מנהל מערכת' : 'משתמש'}
              </span>
            </div>

            {/* מתג Dark / Light Mode */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              title="החלף מצב תצוגה"
            >
              {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
            </button>

            {/* ייצוא לאקסל */}
            <button
              onClick={handleExportCSV}
              style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #10b981', backgroundColor: isDarkMode ? '#064e3b' : '#ecfdf5', color: '#10b981', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              title="ייצא משימות לקובץ CSV"
            >
              📊 ייצוא Excel
            </button>

            {/* שיתוף בוואטסאפ */}
            <button
              onClick={() => handleShareWhatsApp()}
              style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #25d366', backgroundColor: isDarkMode ? '#064e3b' : '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              title="שתף סיכום בוואטסאפ"
            >
              💬 שתף WhatsApp
            </button>

            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowPasswordChangeModal(true)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: theme.textMuted }}
              >
                🔑 סיסמת מנהל
              </button>
            )}

            <button
              onClick={handleLogout}
              style={{ border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#ef4444', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}
            >
              יציאה
            </button>
          </div>

          {/* כפתורי מעבר תצוגה */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', backgroundColor: theme.subCardBg, borderRadius: '10px', padding: '4px', border: `1px solid ${theme.border}` }}>
              <button
                onClick={() => setViewMode('table')}
                style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'table' ? '#2563eb' : 'transparent', color: viewMode === 'table' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s' }}
              >
                📊 טבלה
              </button>
              <button
                onClick={() => setViewMode('cards')}
                style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'cards' ? '#2563eb' : 'transparent', color: viewMode === 'cards' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s' }}
              >
                🗂️ כרטיסיות
              </button>
            </div>

            <div style={{ width: '42px', height: '42px', backgroundColor: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
              ⚡
            </div>
          </div>

        </header>

        {/* סרגל בחירת מספר פרויקטים + עריכת שמות פרויקטים */}
        <div style={{ backgroundColor: theme.cardBg, borderRadius: '16px', padding: '16px 20px', border: `1px solid ${theme.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.03)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: theme.textMain }}>
              📁 בחירת פרויקטים להצגה במקביל:
            </span>
            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowAddProjectModal(true)}
                style={{ padding: '7px 16px', backgroundColor: '#2563eb', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', color: '#ffffff', cursor: 'pointer' }}
              >
                + פרויקט חדש
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedProjects([])}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: selectedProjects.length === 0 ? '1.5px solid #2563eb' : `1px solid ${theme.border}`,
                backgroundColor: selectedProjects.length === 0 ? '#2563eb' : theme.subCardBg,
                color: selectedProjects.length === 0 ? '#ffffff' : theme.textMain,
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              כל הפרויקטים ({tasks.filter((t) => (showArchivedView ? t.isArchived : !t.isArchived)).length})
            </button>

            {allProjectNames.map((pName) => {
              const isSelected = selectedProjects.includes(pName);
              const count = tasks.filter((t) => t.project === pName && (showArchivedView ? t.isArchived : !t.isArchived)).length;
              const pDoc = projects.find((p) => p.name === pName);

              return (
                <div
                  key={pName}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: isSelected ? '1.5px solid #2563eb' : `1px solid ${theme.border}`,
                    backgroundColor: isSelected ? (isDarkMode ? '#1e3a8a' : '#eff6ff') : theme.subCardBg,
                    color: isSelected ? (isDarkMode ? '#bfdbfe' : '#2563eb') : theme.textMain,
                    fontWeight: isSelected ? '800' : '600',
                    fontSize: '13px'
                  }}
                >
                  <span onClick={() => toggleProjectSelection(pName)} style={{ cursor: 'pointer' }}>
                    {isSelected ? '✓ ' : ''}{pName} ({count})
                  </span>

                  {userRole === 'מנהל' && pDoc && (
                    <span
                      onClick={() => { setEditingProject(pDoc); setEditingProjectNewName(pDoc.name); }}
                      style={{ cursor: 'pointer', opacity: 0.6, fontSize: '11px' }}
                      title="ערוך שם פרויקט"
                    >
                      ✏️
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* שורת חיפוש, סינונים והוספת משימה */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש משימה, אחראי, נושא..."
            style={{ flex: 1, minWidth: '200px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none', fontWeight: '700' }}
          >
            <option value="הכל">כל הסטטוסים</option>
            <option value="פתוח">פתוח</option>
            <option value="בביצוע">בביצוע</option>
            <option value="הושלם">הושלם</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none', fontWeight: '700' }}
          >
            <option value="הכל">כל העדיפויות</option>
            <option value="נמוכה">נמוכה</option>
            <option value="בינונית">בינונית</option>
            <option value="דחופה">דחופה</option>
            <option value="קריטית">קריטית</option>
          </select>

          {userRole === 'מנהל' && (
            <button
              onClick={() => setShowArchivedView(!showArchivedView)}
              style={{
                padding: '12px 18px',
                borderRadius: '12px',
                border: showArchivedView ? '1.5px solid #d97706' : `1px solid ${theme.border}`,
                backgroundColor: showArchivedView ? '#fef3c7' : theme.cardBg,
                color: showArchivedView ? '#b45309' : theme.textMain,
                fontWeight: '800',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {showArchivedView ? '📂 חזור למשימות פעילות' : '📦 ארכיון'}
            </button>
          )}

          {userRole === 'מנהל' && !showArchivedView && (
            <button
              onClick={() => setShowAddTaskModal(true)}
              style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
            >
              + משימה חדשה
            </button>
          )}
        </div>

        {/* מודאל עריכת שם פרויקט */}
        {editingProject && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '800' }}>עריכת שם פרויקט</h3>
              <form onSubmit={handleUpdateProjectName} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  type="text"
                  value={editingProjectNewName}
                  onChange={(e) => setEditingProjectNewName(e.target.value)}
                  placeholder="שם פרויקט חדש..."
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור שינוי
                  </button>
                  <button type="button" onClick={() => setEditingProject(null)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל עריכת משימה מלאה */}
        {editingTask && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '520px', textAlign: 'right', border: `1px solid ${theme.border}`, maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '800' }}>עריכת משימה מלאה</h3>
              <form onSubmit={handleSaveEditedTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>פרויקט:</label>
                  <select
                    value={editingTask.project}
                    onChange={(e) => setEditingTask({ ...editingTask, project: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none' }}
                  >
                    {allProjectNames.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>נושא:</label>
                  <input
                    type="text"
                    value={editingTask.topic}
                    onChange={(e) => setEditingTask({ ...editingTask, topic: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור משימה:</label>
                  <textarea
                    value={editingTask.description}
                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={editingTask.assignee}
                      onChange={(e) => setEditingTask({ ...editingTask, assignee: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות:</label>
                    <select
                      value={editingTask.priority}
                      onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as any })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none' }}
                    >
                      <option value="נמוכה">נמוכה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="דחופה">דחופה</option>
                      <option value="קריטית">קריטית</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תאריך יעד:</label>
                    <input
                      type="date"
                      value={editingTask.dueDate}
                      onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>דחיות:</label>
                    <input
                      type="number"
                      value={editingTask.delays || 0}
                      onChange={(e) => setEditingTask({ ...editingTask, delays: parseInt(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור שינויים
                  </button>
                  <button type="button" onClick={() => setEditingTask(null)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל עריכת הערה */}
        {editingNote && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '420px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '800' }}>עריכת הערה</h3>
              <textarea
                value={editingNote.text}
                onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', marginBottom: '14px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSaveEditedNote} style={{ flex: 1, padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                  שמור
                </button>
                <button onClick={() => setEditingNote(null)} style={{ padding: '10px 16px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        {/* מודאל שינוי סיסמת מנהל */}
        {showPasswordChangeModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800' }}>שינוי סיסמת מנהל</h3>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 16px 0' }}>הסיסמה תתעדכן בענן עבור כל המנהלים</p>
              <form onSubmit={handleUpdateAdminPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  value={newAdminPasswordInput}
                  onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                  placeholder="הקלד סיסמה חדשה..."
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור סיסמה
                  </button>
                  <button type="button" onClick={() => setShowPasswordChangeModal(false)} style={{ padding: '12px 16px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל פרויקט חדש */}
        {showAddProjectModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: '800' }}>הוספת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="שם הפרויקט החדש..."
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל משימה חדשה */}
        {showAddTaskModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '520px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 18px 0', fontSize: '20px', fontWeight: '800' }}>הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>פרויקט:</label>
                  <select
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px' }}
                  >
                    {allProjectNames.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>נושא / תת-נושא:</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="למשל: תוכנה, חומרה, בדיקות..."
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור המשימה:</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה נדרש לבצע?"
                    rows={3}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="שם האחראי..."
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות:</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px' }}
                    >
                      <option value="נמוכה">נמוכה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="דחופה">דחופה</option>
                      <option value="קריטית">קריטית</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תאריך יעד:</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* תצוגה ראשית של פרויקטים ומשימות */}
        {allProjectNames
          .filter((p) => selectedProjects.length === 0 || selectedProjects.includes(p))
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const projectDoc = projects.find((p) => p.name === projectName);

            if (projectTasks.length === 0 && showArchivedView) return null;

            return (
              <div key={projectName} style={{ backgroundColor: theme.cardBg, borderRadius: '20px', border: `1px solid ${theme.border}`, overflow: 'hidden', marginBottom: '28px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
                
                {/* כותרת פרויקט */}
                <div style={{ backgroundColor: isDarkMode ? '#0f172a' : '#1e293b', color: '#ffffff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: showArchivedView ? '#d97706' : '#2563eb', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>
                      {showArchivedView ? 'ארכיון' : 'פרויקט'}
                    </span>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                    <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '12px' }}>
                      {projectTasks.length} משימות
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleShareWhatsApp(projectName)}
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#86efac', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                    >
                      💬 WhatsApp פרויקט
                    </button>

                    {projectDoc && userRole === 'מנהל' && !showArchivedView && (
                      <button
                        onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                        style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                      >
                        🗑️ מחק פרויקט
                      </button>
                    )}
                  </div>
                </div>

                {projectTasks.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>
                    אין משימות להצגה בפרויקט זה.
                  </div>
                ) : viewMode === 'table' ? (
                  
                  /* 1. תצוגת טבלה איכותית ומרווחת */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '1300px' }}>
                      <thead>
                        <tr style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderBottom: `1.5px solid ${theme.border}`, color: theme.textMuted }}>
                          <th style={{ padding: '14px 16px', width: '110px' }}>נושא</th>
                          <th style={{ padding: '14px 16px' }}>תיאור המשימה</th>
                          <th style={{ padding: '14px 12px', width: '110px' }}>אחראי</th>
                          <th style={{ padding: '14px 10px', width: '85px' }}>עדיפות</th>
                          <th style={{ padding: '14px 12px', width: '95px' }}>פתיחה</th>
                          <th style={{ padding: '14px 12px', width: '105px' }}>תאריך יעד</th>
                          <th style={{ padding: '14px 12px', width: '105px' }}>השלמה</th>
                          <th style={{ padding: '14px 10px', width: '75px', textAlign: 'center' }}>דחיות</th>
                          <th style={{ padding: '14px 10px', width: '85px', textAlign: 'center' }}>איחור</th>
                          <th style={{ padding: '14px 14px', width: '110px' }}>סטטוס</th>
                          <th style={{ padding: '14px 16px', minWidth: '300px' }}>הערות (כולל תאריך, שעה ועריכה)</th>
                          {userRole === 'מנהל' && <th style={{ padding: '14px 12px', width: '100px', textAlign: 'center' }}>ניהול</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map((t) => {
                          const delayDays = calculateDelayDays(t.dueDate, t.status, t.completedDate);
                          const dueSoon = isDueSoon(t.dueDate, t.status);
                          const isCompleted = t.status === 'הושלם';

                          return (
                            <tr
                              key={t.id}
                              style={{
                                borderBottom: `1px solid ${theme.border}`,
                                backgroundColor: isCompleted
                                  ? (isDarkMode ? '#131d2e' : '#fafafa')
                                  : dueSoon
                                  ? (isDarkMode ? '#422006' : '#fefce8')
                                  : 'transparent',
                                verticalAlign: 'top'
                              }}
                            >
                              
                              <td style={{ padding: '14px 16px', fontWeight: '800', color: '#2563eb' }}>
                                <span style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', padding: '4px 8px', borderRadius: '6px' }}>
                                  {t.topic}
                                </span>
                              </td>

                              <td style={{ padding: '14px 16px', fontWeight: '600', color: isCompleted ? theme.textMuted : theme.textMain, textDecoration: isCompleted ? 'line-through' : 'none', lineHeight: '1.4' }}>
                                {t.description}
                                {dueSoon && (
                                  <span style={{ marginRight: '6px', fontSize: '11px', backgroundColor: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    מתקרב ליעד!
                                  </span>
                                )}
                              </td>

                              <td style={{ padding: '14px 12px' }}>
                                <span style={{ backgroundColor: theme.subCardBg, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', color: theme.textMain, fontWeight: '700' }}>
                                  👤 {t.assignee}
                                </span>
                              </td>

                              {/* עדיפות */}
                              <td style={{ padding: '14px 10px' }}>
                                <span style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  backgroundColor:
                                    t.priority === 'קריטית' ? '#fee2e2' :
                                    t.priority === 'דחופה' ? '#ffedd5' :
                                    t.priority === 'בינונית' ? '#e0f2fe' : '#f1f5f9',
                                  color:
                                    t.priority === 'קריטית' ? '#dc2626' :
                                    t.priority === 'דחופה' ? '#ea580c' :
                                    t.priority === 'בינונית' ? '#0284c7' : '#64748b'
                                }}>
                                  {t.priority}
                                </span>
                              </td>

                              <td style={{ padding: '14px 12px', color: theme.textMuted, fontSize: '12px' }}>
                                {t.startDate}
                              </td>

                              <td style={{ padding: '14px 12px', color: theme.textMain, fontWeight: '700', fontSize: '12px' }}>
                                📅 {t.dueDate}
                              </td>

                              <td style={{ padding: '14px 12px', color: t.completedDate ? '#16a34a' : theme.textMuted, fontWeight: '700', fontSize: '12px' }}>
                                {t.completedDate ? `✓ ${t.completedDate}` : '-'}
                              </td>

                              <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: (t.delays || 0) > 0 ? '#fff7ed' : theme.subCardBg, padding: '2px 8px', borderRadius: '8px', border: (t.delays || 0) > 0 ? '1px solid #fed7aa' : `1px solid ${theme.border}` }}>
                                  <span style={{ fontWeight: '800', color: (t.delays || 0) > 0 ? '#ea580c' : theme.textMuted, fontSize: '12px' }}>
                                    {t.delays || 0}
                                  </span>
                                  {userRole === 'מנהל' && !showArchivedView && (
                                    <button
                                      onClick={() => handleIncrementDelay(t.id, t.delays)}
                                      style={{ background: 'none', border: 'none', color: '#ea580c', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: '0 2px' }}
                                      title="הוסף דחייה (+1)"
                                    >
                                      +1
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                                {delayDays > 0 ? (
                                  <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' }}>
                                    {delayDays} ימים
                                  </span>
                                ) : (
                                  <span style={{ color: theme.textMuted }}>-</span>
                                )}
                              </td>

                              <td style={{ padding: '14px 14px' }}>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                  disabled={showArchivedView}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: showArchivedView ? 'default' : 'pointer',
                                    backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : '#e0f2fe',
                                    color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : '#0369a1'
                                  }}
                                >
                                  <option value="פתוח">פתוח</option>
                                  <option value="בביצוע">בביצוע</option>
                                  <option value="הושלם">הושלם</option>
                                </select>
                              </td>

                              {/* עמודת הערות גלויה עם עריכה ומחיקה */}
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ maxHeight: '110px', overflowY: 'auto', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {(t.notes || []).length === 0 ? (
                                    <span style={{ fontSize: '12px', color: theme.textMuted }}>אין הערות עדיין.</span>
                                  ) : (
                                    t.notes.map((n) => (
                                      <div key={n.id} style={{ fontSize: '12px', backgroundColor: theme.subCardBg, padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                          <div>
                                            <span style={{ fontWeight: '800', color: theme.textMain }}>👤 {n.author}</span>
                                            <span style={{ color: theme.textMuted, fontSize: '10px', marginRight: '6px' }}>🕒 {n.time}</span>
                                          </div>
                                          
                                          {/* כפתורי עריכה/מחיקה להערה */}
                                          <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                              onClick={() => setEditingNote({ taskId: t.id, noteId: n.id, text: n.text })}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', opacity: 0.6 }}
                                              title="ערוך הערה"
                                            >
                                              ✏️
                                            </button>
                                            <button
                                              onClick={() => handleDeleteNote(t.id, n.id)}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#ef4444', opacity: 0.6 }}
                                              title="מחק הערה"
                                            >
                                              🗑️
                                            </button>
                                          </div>
                                        </div>
                                        <div style={{ color: theme.textMain, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                                      </div>
                                    ))
                                  )}
                                </div>

                                {!showArchivedView && (
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <input
                                      type="text"
                                      value={noteInputs[t.id] || ''}
                                      onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })}
                                      placeholder="הוסף הערה..."
                                      style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '12px', outline: 'none' }}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote(t.id)}
                                    />
                                    <button
                                      onClick={() => handleAddNote(t.id)}
                                      style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                      שלח
                                    </button>
                                  </div>
                                )}
                              </td>

                              {userRole === 'מנהל' && (
                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    <button
                                      onClick={() => setEditingTask(t)}
                                      style={{ padding: '4px 6px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                      title="ערוך משימה מלאה"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleToggleArchive(t.id, t.isArchived)}
                                      style={{ padding: '4px 6px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                      title={t.isArchived ? "שחזר" : "ארכיב"}
                                    >
                                      {t.isArchived ? '↩️' : '📦'}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTask(t.id)}
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', padding: '2px' }}
                                      title="מחק לצמיתות"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              )}

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  
                  /* 2. תצוגת כרטיסיות מודרנית */
                  <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {projectTasks.map((t) => {
                      const delayDays = calculateDelayDays(t.dueDate, t.status, t.completedDate);
                      const isCompleted = t.status === 'הושלם';

                      return (
                        <div key={t.id} style={{ backgroundColor: isCompleted ? (isDarkMode ? '#131d2e' : '#fafafa') : theme.subCardBg, border: `1.5px solid ${theme.border}`, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', color: '#2563eb', fontWeight: '800', fontSize: '12px', padding: '3px 8px', borderRadius: '6px' }}>
                                {t.topic}
                              </span>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: '800',
                                backgroundColor:
                                  t.priority === 'קריטית' ? '#fee2e2' :
                                  t.priority === 'דחופה' ? '#ffedd5' :
                                  t.priority === 'בינונית' ? '#e0f2fe' : '#f1f5f9',
                                color:
                                  t.priority === 'קריטית' ? '#dc2626' :
                                  t.priority === 'דחופה' ? '#ea580c' :
                                  t.priority === 'בינונית' ? '#0284c7' : '#64748b'
                              }}>
                                {t.priority}
                              </span>
                            </div>

                            <select
                              value={t.status}
                              onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                              disabled={showArchivedView}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: '800',
                                cursor: showArchivedView ? 'default' : 'pointer',
                                backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : '#e0f2fe',
                                color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : '#0369a1'
                              }}
                            >
                              <option value="פתוח">פתוח</option>
                              <option value="בביצוע">בביצוע</option>
                              <option value="הושלם">הושלם</option>
                            </select>
                          </div>

                          <div style={{ fontSize: '15px', fontWeight: '700', color: isCompleted ? theme.textMuted : theme.textMain, textDecoration: isCompleted ? 'line-through' : 'none', lineHeight: '1.4' }}>
                            {t.description}
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: theme.textMuted }}>
                            <span style={{ backgroundColor: theme.cardBg, padding: '3px 8px', borderRadius: '10px', fontWeight: '700', color: theme.textMain }}>
                              👤 {t.assignee}
                            </span>
                            <span>📅 יעד: {t.dueDate}</span>
                            {delayDays > 0 && (
                              <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>
                                איחור {delayDays} ימים
                              </span>
                            )}
                          </div>

                          {/* הערות בכרטיסייה */}
                          <div style={{ backgroundColor: theme.cardBg, padding: '10px', borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: theme.textMuted, marginBottom: '6px' }}>
                              💬 הערות ({t.notes?.length || 0}):
                            </div>
                            <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                              {(t.notes || []).length === 0 ? (
                                <span style={{ fontSize: '11px', color: theme.textMuted }}>אין הערות עדיין.</span>
                              ) : (
                                t.notes.map((n) => (
                                  <div key={n.id} style={{ fontSize: '11px', backgroundColor: theme.subCardBg, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <span style={{ fontWeight: '700' }}>{n.author}</span>
                                        <span style={{ color: theme.textMuted, fontSize: '9px', marginRight: '4px' }}>{n.time}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '2px' }}>
                                        <button onClick={() => setEditingNote({ taskId: t.id, noteId: n.id, text: n.text })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}>✏️</button>
                                        <button onClick={() => handleDeleteNote(t.id, n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#ef4444' }}>🗑️</button>
                                      </div>
                                    </div>
                                    <div style={{ color: theme.textMain }}>{n.text}</div>
                                  </div>
                                ))
                              )}
                            </div>

                            {!showArchivedView && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input
                                  type="text"
                                  value={noteInputs[t.id] || ''}
                                  onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })}
                                  placeholder="הוסף הערה..."
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '11px', outline: 'none' }}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote(t.id)}
                                />
                                <button
                                  onClick={() => handleAddNote(t.id)}
                                  style={{ padding: '5px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                  שלח
                                </button>
                              </div>
                            )}
                          </div>

                          {userRole === 'מנהל' && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
                              <button
                                onClick={() => setEditingTask(t)}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                              >
                                ✏️ ערוך
                              </button>
                              <button
                                onClick={() => handleToggleArchive(t.id, t.isArchived)}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                              >
                                {t.isArchived ? '↩️ שחזר' : '📦 ארכיב'}
                              </button>
                              <button
                                onClick={() => handleDeleteTask(t.id)}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                              >
                                🗑️ מחק
                              </button>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            );
          })}

      </div>
    </div>
  );
}
