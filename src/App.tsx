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
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  // תצוגות: טבלה, כרטיסיות, יומן, דשבורד
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'calendar' | 'dashboard'>('table');
  const [currentTab, setCurrentTab] = useState<'active' | 'archived' | 'trash'>('active');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('הכל');
  const [priorityFilter, setPriorityFilter] = useState<string>('הכל');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'delays' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Command Palette (Ctrl+K)
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // מודאלים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectDoc | null>(null);
  const [editingProjectNewName, setEditingProjectNewName] = useState('');
  const [editingProjectNewColor, setEditingProjectNewColor] = useState('#2563eb');

  // משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'נמוכה' | 'בינונית' | 'גבוהה'>('בינונית');
  const [newProjectNameInput, setNewProjectNameInput] = useState('');
  const [newProjectColorInput, setNewProjectColorInput] = useState('#2563eb');

  // הערות ותתי-משימות
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});
  const [isManagerOnlyNote, setIsManagerOnlyNote] = useState<{ [taskId: string]: boolean }>({});
  const [editingNote, setEditingNote] = useState<{ taskId: string; noteId: string; text: string; isManagerOnly?: boolean } | null>(null);
  const [activeSubTaskInputTaskId, setActiveSubTaskInputTaskId] = useState<string | null>(null);
  const [subTaskText, setSubTaskText] = useState('');

  // Drag & Drop
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('taskly_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    const q = query(collection(db, 'projects_list'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        color: d.data().color || '#2563eb'
      }));
      setProjects(fetched);
      if (fetched.length > 0 && !newProject) {
        setNewProject(fetched[0].name);
      }
    }, (err) => console.error("Projects error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('startDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Task[] = snapshot.docs.map((d) => {
        const data = d.data() as any;
        const notesWithId = (data.notes || []).map((n: any, idx: number) => ({
          id: n.id || `note_${idx}_${Date.now()}`,
          text: n.text || '',
          author: n.author || 'אורח',
          time: n.time || '',
          isManagerOnly: !!n.isManagerOnly
        }));

        const subtasksWithId = (data.subtasks || []).map((s: any, idx: number) => ({
          id: s.id || `sub_${idx}_${Date.now()}`,
          text: s.text || '',
          completed: !!s.completed
        }));

        let mappedPriority: 'נמוכה' | 'בינונית' | 'גבוהה' = 'בינונית';
        if (data.priority === 'קריטית' || data.priority === 'דחופה' || data.priority === 'גבוהה') {
          mappedPriority = 'גבוהה';
        } else if (data.priority === 'נמוכה') {
          mappedPriority = 'נמוכה';
        }

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
          priority: mappedPriority,
          isArchived: !!data.isArchived,
          isDeleted: !!data.isDeleted,
          orderIndex: data.orderIndex || 0,
          status: data.status || 'פתוח',
          notes: notesWithId,
          subtasks: subtasksWithId
        };
      });
      setTasks(fetched);
    }, (err) => console.error("Tasks error:", err));
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
    setIsUserMenuOpen(false);
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
      color: newProjectColorInput,
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

    await updateDoc(doc(db, 'projects_list', editingProject.id), {
      name: newName,
      color: editingProjectNewColor
    });

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
    setShowAddTaskModal(false);
  };

  const handleDuplicateTask = async (task: Task) => {
    if (userRole !== 'מנהל') return;
    const todayStr = new Date().toISOString().split('T')[0];

    const clonedSubtasks = (task.subtasks || []).map((s) => ({
      id: `sub_${Date.now()}_${Math.random()}`,
      text: s.text,
      completed: false
    }));

    await addDoc(collection(db, 'tasks'), {
      project: task.project,
      topic: task.topic,
      description: `${task.description} (העתק)`,
      assignee: task.assignee,
      startDate: todayStr,
      dueDate: task.dueDate || todayStr,
      completedDate: '',
      delays: 0,
      priority: task.priority,
      isArchived: false,
      isDeleted: false,
      orderIndex: Date.now(),
      status: 'פתוח',
      notes: [],
      subtasks: clonedSubtasks,
      createdAt: serverTimestamp()
    });
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
      time: fullTimestamp,
      isManagerOnly: userRole === 'מנהל' && !!isManagerOnlyNote[taskId]
    }];

    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setNoteInputs({ ...noteInputs, [taskId]: '' });
  };

  const handleSaveEditedNote = async () => {
    if (!editingNote || !editingNote.text.trim()) return;

    const task = tasks.find((t) => t.id === editingNote.taskId);
    if (!task) return;

    const updatedNotes = (task.notes || []).map((n) =>
      n.id === editingNote.noteId ? { ...n, text: editingNote.text.trim(), isManagerOnly: editingNote.isManagerOnly } : n
    );

    await updateDoc(doc(db, 'tasks', editingNote.taskId), { notes: updatedNotes });
    setEditingNote(null);
  };

  const handleDeleteNote = async (taskId: string, noteId: string) => {
    if (!window.confirm("למחוק הערה זו?")) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedNotes = (task.notes || []).filter((n) => n.id !== noteId);
    await updateDoc(doc(db, 'tasks', taskId), { notes: updatedNotes });
  };

  const handleAddSubTaskDirect = async (taskId: string) => {
    if (!subTaskText.trim()) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = [...(task.subtasks || []), {
      id: `sub_${Date.now()}`,
      text: subTaskText.trim(),
      completed: false
    }];

    await updateDoc(doc(db, 'tasks', taskId), { subtasks: updatedSubtasks });
    setSubTaskText('');
    setActiveSubTaskInputTaskId(null);
  };

  const handleToggleSubTask = async (taskId: string, subtaskId: string, currentStatus: boolean) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, completed: !currentStatus } : s
    );

    await updateDoc(doc(db, 'tasks', taskId), { subtasks: updatedSubtasks });
  };

  const handleDeleteSubTask = async (taskId: string, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).filter((s) => s.id !== subtaskId);
    await updateDoc(doc(db, 'tasks', taskId), { subtasks: updatedSubtasks });
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

  const handleArchiveAllCompleted = async () => {
    if (userRole !== 'מנהל') return;
    const completedTasks = tasks.filter((t) => !t.isDeleted && !t.isArchived && t.status === 'הושלם');
    if (completedTasks.length === 0) {
      alert("אין משימות שהושלמו להעברה לארכיון.");
      return;
    }

    if (!window.confirm(`האם להעביר ${completedTasks.length} משימות שהושלמו לארכיון?`)) return;
    completedTasks.forEach(async (t) => {
      await updateDoc(doc(db, 'tasks', t.id), { isArchived: true });
    });
  };

  const handleToggleTrash = async (taskId: string, currentDeleted: boolean) => {
    if (userRole !== 'מנהל') return;
    await updateDoc(doc(db, 'tasks', taskId), {
      isDeleted: !currentDeleted
    });
  };

  const handlePermanentDelete = async (taskId: string) => {
    if (userRole !== 'מנהל') return;
    if (!window.confirm("למחוק משימה זו לצמיתות? לא ניתן יהיה לשחזר אותה.")) return;
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  const handleEmptyTrash = async () => {
    if (userRole !== 'מנהל') return;
    const trashTasks = tasks.filter((t) => t.isDeleted);
    if (trashTasks.length === 0) {
      alert("סל המחזור ריק.");
      return;
    }

    if (!window.confirm(`האם לרוקן את סל המחזור ולמחוק לצמיתות ${trashTasks.length} משימות?`)) return;
    trashTasks.forEach(async (t) => {
      await deleteDoc(doc(db, 'tasks', t.id));
    });
  };

  const handleDragStart = (taskId: string) => {
    if (userRole !== 'מנהל') return;
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetTaskId: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId || userRole !== 'מנהל') return;

    const targetTask = tasks.find((t) => t.id === targetTaskId);
    if (!targetTask) return;

    const targetOrder = targetTask.orderIndex || 0;
    await updateDoc(doc(db, 'tasks', draggedTaskId), {
      orderIndex: targetOrder + 1
    });

    setDraggedTaskId(null);
  };

  const handleExportCSV = () => {
    const activeTasks = tasks.filter((t) => !t.isDeleted && (currentTab === 'archived' ? t.isArchived : !t.isArchived));
    if (activeTasks.length === 0) {
      alert("אין נתונים לייצוא.");
      return;
    }

    const headers = ['פרויקט', 'נושא', 'תיאור המשימה', 'תתי משימות', 'אחראי', 'עדיפות', 'תאריך פתיחה', 'תאריך יעד', 'השלמה בפועל', 'דחיות', 'סטטוס', 'הערות'];
    const rows = activeTasks.map((t) => [
      `"${t.project}"`,
      `"${t.topic}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${(t.subtasks || []).map((s) => `${s.completed ? '[V]' : '[ ]'} ${s.text}`).join('; ')}"`,
      `"${t.assignee}"`,
      `"${t.priority}"`,
      `"${t.startDate}"`,
      `"${t.dueDate}"`,
      `"${t.completedDate || ''}"`,
      t.delays || 0,
      `"${t.status}"`,
      `"${(t.notes || []).filter(n => !n.isManagerOnly || userRole === 'מנהל').map((n) => `${n.author} (${n.time}): ${n.text}`).join(' | ').replace(/"/g, '""')}"`
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

  const handleShareWhatsApp = (projectName?: string) => {
    const relevant = tasks.filter((t) =>
      !t.isDeleted &&
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
      text += `   👤 אחראי: ${t.assignee} | 📅 יעד: ${t.dueDate} | עדיפות: ${t.priority} | סטטוס: ${t.status}\n`;
      if (t.subtasks && t.subtasks.length > 0) {
        const completedCount = t.subtasks.filter((s) => s.completed).length;
        text += `   ☑️ תתי-משימות: ${completedCount}/${t.subtasks.length} הושלמו\n`;
      }
      if (t.notes && t.notes.length > 0) {
        text += `   💬 הערה אחרונה: ${t.notes[t.notes.length - 1].text}\n`;
      }
      text += `\n`;
    });

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
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
      let matchTab = false;
      if (currentTab === 'trash') {
        matchTab = t.isDeleted;
      } else if (currentTab === 'archived') {
        matchTab = !t.isDeleted && t.isArchived;
      } else {
        matchTab = !t.isDeleted && !t.isArchived;
      }

      const matchProject = selectedProjects.length === 0 || selectedProjects.includes(t.project);
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
          const timeA = new Date(a.dueDate).getTime() || 0;
          const timeB = new Date(b.dueDate).getTime() || 0;
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }
        if (sortBy === 'priority') {
          const pA = priorityWeights[a.priority] || 0;
          const pB = priorityWeights[b.priority] || 0;
          return sortOrder === 'asc' ? pA - pB : pB - pA;
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
  }, [tasks, currentTab, selectedProjects, statusFilter, priorityFilter, searchTerm, sortBy, sortOrder]);

  const getProjectColor = (pName: string) => {
    const p = projects.find((x) => x.name === pName);
    return p?.color || '#2563eb';
  };

  const counts = useMemo(() => {
    const active = tasks.filter((t) => !t.isDeleted && !t.isArchived).length;
    const archived = tasks.filter((t) => !t.isDeleted && t.isArchived).length;
    const trash = tasks.filter((t) => t.isDeleted).length;
    const completedActive = tasks.filter((t) => !t.isDeleted && !t.isArchived && t.status === 'הושלם').length;
    return { active, archived, trash, completedActive };
  }, [tasks]);

  const dashboardMetrics = useMemo(() => {
    const active = tasks.filter((t) => !t.isDeleted && !t.isArchived);
    
    const assigneeLoad: { [key: string]: number } = {};
    active.forEach((t) => {
      const name = t.assignee || 'ללא אחראי';
      assigneeLoad[name] = (assigneeLoad[name] || 0) + 1;
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

  // מסך התחברות
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090d16', padding: '20px', direction: 'rtl', fontFamily: "'Heebo', system-ui, -apple-system, sans-serif" }}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" />
        
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#111827', borderRadius: '24px', padding: '36px 28px', border: '1px solid #1f2937', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', textAlign: 'center' }}>
          
          <div style={{ width: '60px', height: '60px', backgroundColor: '#2563eb', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px', boxShadow: '0 8px 20px -4px rgba(37,99,235,0.5)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '25px', fontWeight: '900', color: '#f9fafb', margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>כניסה למערכת</h2>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 24px 0', fontWeight: '500' }}>ניהול ומעקב משימות ופרויקטים</p>

          {authError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'right' }}>
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
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
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
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#2563eb' : 'transparent', color: roleInput === 'משתמש' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}
                >
                  משתמש
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('מנהל')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#2563eb' : 'transparent', color: roleInput === 'מנהל' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}
                >
                  מנהל
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
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            )}

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
        <header style={{ backgroundColor: theme.cardBg, borderRadius: '18px', padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', border: `1px solid ${theme.border}`, marginBottom: '20px', position: 'relative' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', backgroundColor: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
                ⚡
              </div>
              <div style={{ textAlign: 'right' }}>
                <h1 style={{ fontSize: '21px', fontWeight: '900', color: theme.textMain, margin: 0, letterSpacing: '-0.3px' }}>Taskly Pro</h1>
                <span style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '500' }}>ניהול ומעקב משימות</span>
              </div>
            </div>

            <button
              onClick={() => setShowCommandPalette(true)}
              style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMuted, fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🔍 חיפוש מהיר</span>
              <span style={{ fontSize: '10px', backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, padding: '2px 5px', borderRadius: '4px' }}>Ctrl + K</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
              </button>

              <button
                onClick={handleExportCSV}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #10b981', backgroundColor: isDarkMode ? '#064e3b' : '#ecfdf5', color: '#10b981', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                📊 ייצוא Excel
              </button>

              <button
                onClick={() => handleShareWhatsApp()}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #25d366', backgroundColor: isDarkMode ? '#064e3b' : '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                💬 WhatsApp
              </button>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: theme.subCardBg,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontWeight: '800', color: theme.textMain, fontSize: '14px' }}>{currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                {userRole === 'מנהל' ? 'מנהל' : 'משתמש'}
              </span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>▼</span>
            </button>

            {isUserMenuOpen && (
              <div style={{
                position: 'absolute',
                left: 0,
                top: '115%',
                width: '180px',
                backgroundColor: theme.cardBg,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                padding: '6px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {userRole === 'מנהל' && (
                  <button
                    onClick={() => { setIsUserMenuOpen(false); setShowPasswordChangeModal(true); }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: theme.textMain,
                      fontSize: '13px',
                      fontWeight: '700',
                      textAlign: 'right',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>🔑</span>
                    <span>שינוי סיסמת מנהל</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: '700',
                    textAlign: 'right',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderTop: `1px solid ${theme.border}`
                  }}
                >
                  <span>🚪</span>
                  <span>יציאה מהמערכת</span>
                </button>
              </div>
            )}
          </div>

        </header>

        {/* Command Palette */}
        {showCommandPalette && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, paddingTop: '15vh' }}>
            <div style={{ backgroundColor: theme.cardBg, borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '580px', border: `1px solid ${theme.border}`, boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="חיפוש גלובלי מהיר בכל המשימות..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '15px', outline: 'none' }}
                />
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredTasks.slice(0, 8).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => { setShowCommandPalette(false); }}
                    style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: theme.subCardBg, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <span style={{ fontWeight: '800', color: getProjectColor(t.project), marginLeft: '8px' }}>[{t.project}]</span>
                      <span style={{ fontWeight: '600', color: theme.textMain }}>{t.description}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>{t.assignee}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* סרגל בחירת פרויקטים + הוספת פרויקט מתוקנת */}
        <div style={{ backgroundColor: theme.cardBg, borderRadius: '16px', padding: '16px 20px', border: `1px solid ${theme.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.03)', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', color: theme.textMain }}>
              📁 בחירת פרויקטים להצגה במקביל:
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', backgroundColor: theme.subCardBg, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}`, flexWrap: 'wrap', gap: '2px' }}>
                <button
                  onClick={() => setViewMode('table')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'table' ? '#2563eb' : 'transparent', color: viewMode === 'table' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                >
                  📊 טבלה
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'cards' ? '#2563eb' : 'transparent', color: viewMode === 'cards' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                >
                  🗂️ כרטיסיות
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'calendar' ? '#2563eb' : 'transparent', color: viewMode === 'calendar' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                >
                  📅 יומן
                </button>
                <button
                  onClick={() => setViewMode('dashboard')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'dashboard' ? '#2563eb' : 'transparent', color: viewMode === 'dashboard' ? '#ffffff' : theme.textMuted, fontWeight: '800', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                >
                  📊 דשבורד
                </button>
              </div>

              {userRole === 'מנהל' && (
                <button
                  onClick={() => setShowAddProjectModal(true)}
                  style={{ padding: '8px 16px', backgroundColor: '#2563eb', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', color: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  + פרויקט חדש
                </button>
              )}
            </div>
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
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              כל הפרויקטים ({filteredTasks.length})
            </button>

            {allProjectNames.map((pName) => {
              const isSelected = selectedProjects.includes(pName);
              const count = tasks.filter((t) => {
                if (currentTab === 'trash') return t.isDeleted && t.project === pName;
                if (currentTab === 'archived') return !t.isDeleted && t.isArchived && t.project === pName;
                return !t.isDeleted && !t.isArchived && t.project === pName;
              }).length;
              const pDoc = projects.find((p) => p.name === pName);
              const pColor = getProjectColor(pName);

              return (
                <div
                  key={pName}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: isSelected ? `1.5px solid ${pColor}` : `1px solid ${theme.border}`,
                    backgroundColor: isSelected ? `${pColor}20` : theme.subCardBg,
                    color: isSelected ? pColor : theme.textMain,
                    fontWeight: isSelected ? '800' : '600',
                    fontSize: '13px'
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: pColor }} />
                  <span onClick={() => toggleProjectSelection(pName)} style={{ cursor: 'pointer' }}>
                    {isSelected ? '✓ ' : ''}{pName} ({count})
                  </span>

                  {userRole === 'מנהל' && pDoc && (
                    <span
                      onClick={() => { setEditingProject(pDoc); setEditingProjectNewName(pDoc.name); setEditingProjectNewColor(pDoc.color || '#2563eb'); }}
                      style={{ cursor: 'pointer', opacity: 0.6, fontSize: '11px' }}
                      title="ערוך שם וצבע פרויקט"
                    >
                      ✏️
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* טאבים ראשיים */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setCurrentTab('active')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: currentTab === 'active' ? '1.5px solid #2563eb' : `1px solid ${theme.border}`,
                backgroundColor: currentTab === 'active' ? (isDarkMode ? '#1e3a8a' : '#eff6ff') : theme.cardBg,
                color: currentTab === 'active' ? '#2563eb' : theme.textMain,
                fontWeight: '800',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📋 משימות פעילות ({counts.active})
            </button>

            <button
              onClick={() => setCurrentTab('archived')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: currentTab === 'archived' ? '1.5px solid #d97706' : `1px solid ${theme.border}`,
                backgroundColor: currentTab === 'archived' ? (isDarkMode ? '#451a03' : '#fef3c7') : theme.cardBg,
                color: currentTab === 'archived' ? '#d97706' : theme.textMain,
                fontWeight: '800',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📦 ארכיון ({counts.archived})
            </button>

            <button
              onClick={() => setCurrentTab('trash')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: currentTab === 'trash' ? '1.5px solid #dc2626' : `1px solid ${theme.border}`,
                backgroundColor: currentTab === 'trash' ? (isDarkMode ? '#450a0a' : '#fee2e2') : theme.cardBg,
                color: currentTab === 'trash' ? '#dc2626' : theme.textMain,
                fontWeight: '800',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🗑️ סל מחזור ({counts.trash})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {userRole === 'מנהל' && currentTab === 'active' && counts.completedActive > 0 && (
              <button
                onClick={handleArchiveAllCompleted}
                style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #d97706', backgroundColor: '#fffbeb', color: '#b45309', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}
              >
                📦 העבר משימות שהושלמו לארכיון ({counts.completedActive})
              </button>
            )}

            {userRole === 'מנהל' && currentTab === 'trash' && counts.trash > 0 && (
              <button
                onClick={handleEmptyTrash}
                style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}
              >
                🔥 רוקן סל מחזור
              </button>
            )}
          </div>

        </div>

        {/* שורת חיפוש וסינונים (כולל הסטטוס החדש "נדחה") */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש משימה, אחראי, נושא..."
            style={{ flex: 1, minWidth: '200px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none', fontFamily: 'inherit' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none', fontWeight: '700', fontFamily: 'inherit' }}
          >
            <option value="הכל">כל הסטטוסים</option>
            <option value="פתוח">פתוח</option>
            <option value="בביצוע">בביצוע</option>
            <option value="הושלם">הושלם</option>
            <option value="נדחה">נדחה</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '14px', outline: 'none', fontWeight: '700', fontFamily: 'inherit' }}
          >
            <option value="הכל">כל העדיפויות</option>
            <option value="גבוהה">גבוהה</option>
            <option value="בינונית">בינונית</option>
            <option value="נמוכה">נמוכה</option>
          </select>

          {userRole === 'מנהל' && currentTab === 'active' && (
            <button
              onClick={() => setShowAddTaskModal(true)}
              style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)', fontFamily: 'inherit' }}
            >
              + משימה חדשה
            </button>
          )}
        </div>

        {/* מודאל עריכת שם פרויקט */}
        {editingProject && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', textAlign: 'right', border: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '800' }}>עריכת פרויקט</h3>
              <form onSubmit={handleUpdateProjectName} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  type="text"
                  value={editingProjectNewName}
                  onChange={(e) => setEditingProjectNewName(e.target.value)}
                  placeholder="שם פרויקט חדש..."
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>צבע פרויקט:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditingProjectNewColor(c)}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: c, border: editingProjectNewColor === c ? '2px solid #ffffff' : 'none', cursor: 'pointer', boxShadow: editingProjectNewColor === c ? '0 0 0 2px #2563eb' : 'none' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    שמור
                  </button>
                  <button type="button" onClick={() => setEditingProject(null)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontFamily: 'inherit' }}
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
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור משימה:</label>
                  <textarea
                    value={editingTask.description}
                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={editingTask.assignee}
                      onChange={(e) => setEditingTask({ ...editingTask, assignee: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות:</label>
                    <select
                      value={editingTask.priority}
                      onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as any })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontFamily: 'inherit' }}
                    >
                      <option value="גבוהה">גבוהה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="נמוכה">נמוכה</option>
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
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>דחיות:</label>
                    <input
                      type="number"
                      value={editingTask.delays || 0}
                      onChange={(e) => setEditingTask({ ...editingTask, delays: parseInt(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    שמור שינויים
                  </button>
                  <button type="button" onClick={() => setEditingTask(null)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', marginBottom: '14px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSaveEditedNote} style={{ flex: 1, padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                  שמור
                </button>
                <button onClick={() => setEditingNote(null)} style={{ padding: '10px 16px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    שמור
                  </button>
                  <button type="button" onClick={() => setShowPasswordChangeModal(false)} style={{ padding: '12px 16px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>בחר צבע לפרויקט:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewProjectColorInput(c)}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: c, border: newProjectColorInput === c ? '2px solid #ffffff' : 'none', cursor: 'pointer', boxShadow: newProjectColorInput === c ? '0 0 0 2px #2563eb' : 'none' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', fontFamily: 'inherit' }}
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
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תיאור המשימה:</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה נדרש לבצע?"
                    rows={3}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontSize: '14px', fontFamily: 'inherit' }}
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
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>עדיפות:</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', fontSize: '14px', fontFamily: 'inherit' }}
                    >
                      <option value="גבוהה">גבוהה</option>
                      <option value="בינונית">בינונית</option>
                      <option value="נמוכה">נמוכה</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>תאריך יעד:</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, outline: 'none', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 18px', backgroundColor: theme.subCardBg, color: theme.textMuted, border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* תצוגה ראשית */}
        {allProjectNames
          .filter((p) => selectedProjects.length === 0 || selectedProjects.includes(p))
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const projectDoc = projects.find((p) => p.name === projectName);
            const pColor = getProjectColor(projectName);

            if (projectTasks.length === 0 && currentTab !== 'active') return null;

            return (
              <div key={projectName} style={{ backgroundColor: theme.cardBg, borderRadius: '20px', border: `1px solid ${theme.border}`, overflow: 'hidden', marginBottom: '28px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
                
                {/* כותרת פרויקט */}
                <div style={{ backgroundColor: isDarkMode ? '#0f172a' : '#1e293b', borderTop: `4px solid ${pColor}`, color: '#ffffff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: pColor, padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>
                      {currentTab === 'trash' ? 'סל מחזור' : currentTab === 'archived' ? 'ארכיון' : 'פרויקט'}
                    </span>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                    <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '12px' }}>
                      {projectTasks.length} משימות
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {currentTab === 'active' && (
                      <button
                        onClick={() => handleShareWhatsApp(projectName)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#86efac', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}
                      >
                        💬 WhatsApp פרויקט
                      </button>
                    )}

                    {projectDoc && userRole === 'מנהל' && currentTab === 'active' && (
                      <button
                        onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                        style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}
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
                  
                  /* 1. תצוגת טבלה */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '1350px' }}>
                      <thead>
                        <tr style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderBottom: `1.5px solid ${theme.border}`, color: theme.textMuted }}>
                          {userRole === 'מנהל' && <th style={{ width: '30px' }}></th>}
                          <th style={{ padding: '14px 16px', width: '110px' }}>נושא</th>
                          <th style={{ padding: '14px 16px', minWidth: '240px' }}>תיאור המשימה</th>
                          <th style={{ padding: '14px 12px', width: '110px' }}>אחראי</th>
                          <th
                            onClick={() => handleSort('priority')}
                            style={{ padding: '14px 10px', width: '85px', cursor: 'pointer', userSelect: 'none' }}
                          >
                            עדיפות {sortBy === 'priority' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </th>
                          <th style={{ padding: '14px 12px', width: '95px' }}>פתיחה</th>
                          <th
                            onClick={() => handleSort('dueDate')}
                            style={{ padding: '14px 12px', width: '105px', cursor: 'pointer', userSelect: 'none' }}
                          >
                            תאריך יעד {sortBy === 'dueDate' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </th>
                          <th style={{ padding: '14px 12px', width: '105px' }}>השלמה</th>
                          <th
                            onClick={() => handleSort('delays')}
                            style={{ padding: '14px 10px', width: '95px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                          >
                            דחיות {sortBy === 'delays' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </th>
                          <th style={{ padding: '14px 10px', width: '85px', textAlign: 'center' }}>איחור</th>
                          <th style={{ padding: '14px 14px', width: '110px' }}>סטטוס</th>
                          <th style={{ padding: '14px 16px', minWidth: '280px' }}>הערות</th>
                          {userRole === 'מנהל' && <th style={{ padding: '14px 12px', width: '120px', textAlign: 'center' }}>פעולות</th>}
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
                              draggable={userRole === 'מנהל'}
                              onDragStart={() => handleDragStart(t.id)}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDrop(t.id)}
                              style={{
                                borderBottom: `1px solid ${theme.border}`,
                                backgroundColor: isCompleted
                                  ? (isDarkMode ? '#131d2e' : '#fafafa')
                                  : dueSoon
                                  ? (isDarkMode ? '#422006' : '#fefce8')
                                  : 'transparent',
                                verticalAlign: 'top',
                                cursor: userRole === 'מנהל' ? 'grab' : 'default'
                              }}
                            >
                              {userRole === 'מנהל' && (
                                <td style={{ padding: '14px 6px', textAlign: 'center', color: theme.textMuted, opacity: 0.5 }}>
                                  ⋮⋮
                                </td>
                              )}
                              
                              <td style={{ padding: '14px 16px', fontWeight: '800', color: pColor }}>
                                <span style={{ backgroundColor: `${pColor}15`, padding: '4px 8px', borderRadius: '6px' }}>
                                  {t.topic}
                                </span>
                              </td>

                              {/* תיאור משימה + פלוס קטן להוספת תת-משימה */}
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                  <span style={{ fontWeight: '600', color: isCompleted ? theme.textMuted : theme.textMain, textDecoration: isCompleted ? 'line-through' : 'none', lineHeight: '1.4' }}>
                                    {t.description}
                                  </span>

                                  {currentTab === 'active' && (
                                    <button
                                      onClick={() => {
                                        setActiveSubTaskInputTaskId(activeSubTaskInputTaskId === t.id ? null : t.id);
                                        setSubTaskText('');
                                      }}
                                      style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        border: `1px solid ${theme.border}`,
                                        backgroundColor: theme.subCardBg,
                                        color: '#2563eb',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0
                                      }}
                                      title="הוסף תת-משימה"
                                    >
                                      +
                                    </button>
                                  )}

                                  {dueSoon && (
                                    <span style={{ fontSize: '11px', backgroundColor: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                      מתקרב ליעד!
                                    </span>
                                  )}
                                </div>

                                {activeSubTaskInputTaskId === t.id && (
                                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                    <input
                                      type="text"
                                      value={subTaskText}
                                      onChange={(e) => setSubTaskText(e.target.value)}
                                      placeholder="שם תת-המשימה..."
                                      autoFocus
                                      style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '12px', outline: 'none' }}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubTaskDirect(t.id)}
                                    />
                                    <button
                                      onClick={() => handleAddSubTaskDirect(t.id)}
                                      style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                      הוסף
                                    </button>
                                  </div>
                                )}

                                {(t.subtasks || []).length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px', paddingRight: '4px', borderRight: `2px solid ${pColor}40` }}>
                                    {t.subtasks.map((s) => (
                                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', gap: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                          <input
                                            type="checkbox"
                                            checked={s.completed}
                                            onChange={() => handleToggleSubTask(t.id, s.id, s.completed)}
                                            disabled={currentTab === 'trash'}
                                          />
                                          <span style={{ textDecoration: s.completed ? 'line-through' : 'none', color: s.completed ? theme.textMuted : theme.textMain }}>
                                            {s.text}
                                          </span>
                                        </label>
                                        {currentTab !== 'trash' && (
                                          <button
                                            onClick={() => handleDeleteSubTask(t.id, s.id)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', opacity: 0.6 }}
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '14px 12px' }}>
                                <span style={{ backgroundColor: theme.subCardBg, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', color: theme.textMain, fontWeight: '700' }}>
                                  👤 {t.assignee}
                                </span>
                              </td>

                              {/* עדיפות נקיות ללא צבעים בסוגריים */}
                              <td style={{ padding: '14px 10px' }}>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  backgroundColor:
                                    t.priority === 'גבוהה' ? '#fee2e2' :
                                    t.priority === 'בינונית' ? '#ffedd5' : '#dcfce7',
                                  color:
                                    t.priority === 'גבוהה' ? '#dc2626' :
                                    t.priority === 'בינונית' ? '#ea580c' : '#16a34a',
                                  border:
                                    t.priority === 'גבוהה' ? '1px solid #fca5a5' :
                                    t.priority === 'בינונית' ? '1px solid #fed7aa' : '1px solid #86efac'
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
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                  <span style={{
                                    backgroundColor: (t.delays || 0) > 0 ? (isDarkMode ? '#451a03' : '#fff7ed') : theme.subCardBg,
                                    color: (t.delays || 0) > 0 ? '#ea580c' : theme.textMuted,
                                    border: (t.delays || 0) > 0 ? '1px solid #fed7aa' : `1px solid ${theme.border}`,
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '12px',
                                    minWidth: '22px',
                                    textAlign: 'center'
                                  }}>
                                    {t.delays || 0}
                                  </span>

                                  {userRole === 'מנהל' && currentTab === 'active' && (
                                    <button
                                      onClick={() => handleIncrementDelay(t.id, t.delays)}
                                      style={{ width: '24px', height: '24px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: '#ea580c', cursor: 'pointer', fontWeight: '900', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                      title="הוסף דחייה (+1)"
                                    >
                                      +
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

                              {/* סטטוס כולל "נדחה" */}
                              <td style={{ padding: '14px 14px' }}>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                  disabled={currentTab !== 'active'}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: currentTab === 'active' ? 'pointer' : 'default',
                                    fontFamily: 'inherit',
                                    backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : t.status === 'נדחה' ? '#fee2e2' : '#e0f2fe',
                                    color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : t.status === 'נדחה' ? '#b91c1c' : '#0369a1'
                                  }}
                                >
                                  <option value="פתוח">פתוח</option>
                                  <option value="בביצוע">בביצוע</option>
                                  <option value="הושלם">הושלם</option>
                                  <option value="נדחה">נדחה</option>
                                </select>
                              </td>

                              {/* הערות */}
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ maxHeight: '110px', overflowY: 'auto', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {(t.notes || []).filter(n => !n.isManagerOnly || userRole === 'מנהל').length === 0 ? (
                                    <span style={{ fontSize: '12px', color: theme.textMuted }}>אין הערות עדיין.</span>
                                  ) : (
                                    t.notes
                                      .filter(n => !n.isManagerOnly || userRole === 'מנהל')
                                      .map((n) => (
                                        <div key={n.id} style={{ fontSize: '12px', backgroundColor: n.isManagerOnly ? (isDarkMode ? '#451a03' : '#fffbeb') : theme.subCardBg, padding: '6px 10px', borderRadius: '8px', border: n.isManagerOnly ? '1px solid #fcd34d' : `1px solid ${theme.border}` }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                            <div>
                                              <span style={{ fontWeight: '800', color: theme.textMain }}>👤 {n.author}</span>
                                              {n.isManagerOnly && (
                                                <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '4px', marginRight: '4px', fontWeight: 'bold' }}>🔒 למנהל</span>
                                              )}
                                              <span style={{ color: theme.textMuted, fontSize: '10px', marginRight: '6px' }}>🕒 {n.time}</span>
                                            </div>
                                            
                                            {currentTab === 'active' && (
                                              <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                  onClick={() => setEditingNote({ taskId: t.id, noteId: n.id, text: n.text, isManagerOnly: n.isManagerOnly })}
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
                                            )}
                                          </div>
                                          <div style={{ color: theme.textMain, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                                        </div>
                                      ))
                                  )}
                                </div>

                                {currentTab === 'active' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <input
                                        type="text"
                                        value={noteInputs[t.id] || ''}
                                        onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })}
                                        placeholder="הוסף הערה..."
                                        style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote(t.id)}
                                      />
                                      <button
                                        onClick={() => handleAddNote(t.id)}
                                        style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}
                                      >
                                        שלח
                                      </button>
                                    </div>
                                    {userRole === 'מנהל' && (
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.textMuted, cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={!!isManagerOnlyNote[t.id]}
                                          onChange={(e) => setIsManagerOnlyNote({ ...isManagerOnlyNote, [t.id]: e.target.checked })}
                                        />
                                        <span>🔒 הערה פנימית (למנהלים בלבד)</span>
                                      </label>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* פעולות מנהל */}
                              {userRole === 'מנהל' && (
                                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    
                                    {currentTab === 'active' && (
                                      <>
                                        <button
                                          onClick={() => handleDuplicateTask(t)}
                                          style={{ padding: '4px 6px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="שכפל משימה"
                                        >
                                          📋
                                        </button>
                                        <button
                                          onClick={() => setEditingTask(t)}
                                          style={{ padding: '4px 6px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="ערוך משימה"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => handleToggleArchive(t.id, t.isArchived)}
                                          style={{ padding: '4px 6px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="העבר לארכיון"
                                        >
                                          📦
                                        </button>
                                        <button
                                          onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                          style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="העבר לסל מחזור"
                                        >
                                          🗑️
                                        </button>
                                      </>
                                    )}

                                    {currentTab === 'archived' && (
                                      <>
                                        <button
                                          onClick={() => handleToggleArchive(t.id, t.isArchived)}
                                          style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.subCardBg, color: '#2563eb', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="שחזר למשימות פעילות"
                                        >
                                          ↩️ החזר
                                        </button>
                                        <button
                                          onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                          style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="העבר לסל מחזור"
                                        >
                                          🗑️
                                        </button>
                                      </>
                                    )}

                                    {currentTab === 'trash' && (
                                      <>
                                        <button
                                          onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#16a34a', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="שחזר מסל מחזור"
                                        >
                                          ↩️ שחזר
                                        </button>
                                        <button
                                          onClick={() => handlePermanentDelete(t.id)}
                                          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                          title="מחק לצמיתות"
                                        >
                                          ✕ מחק
                                        </button>
                                      </>
                                    )}

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
                  
                  /* 2. תצוגת כרטיסיות */
                  <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {projectTasks.map((t) => {
                      const delayDays = calculateDelayDays(t.dueDate, t.status, t.completedDate);
                      const isCompleted = t.status === 'הושלם';

                      return (
                        <div key={t.id} style={{ backgroundColor: isCompleted ? (isDarkMode ? '#131d2e' : '#fafafa') : theme.subCardBg, border: `1.5px solid ${theme.border}`, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ backgroundColor: `${pColor}15`, color: pColor, fontWeight: '800', fontSize: '12px', padding: '3px 8px', borderRadius: '6px' }}>
                                {t.topic}
                              </span>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: '800',
                                backgroundColor:
                                  t.priority === 'גבוהה' ? '#fee2e2' :
                                  t.priority === 'בינונית' ? '#ffedd5' : '#dcfce7',
                                color:
                                  t.priority === 'גבוהה' ? '#dc2626' :
                                  t.priority === 'בינונית' ? '#ea580c' : '#16a34a',
                                border:
                                  t.priority === 'גבוהה' ? '1px solid #fca5a5' :
                                  t.priority === 'בינונית' ? '1px solid #fed7aa' : '1px solid #86efac'
                              }}>
                                {t.priority}
                              </span>
                            </div>

                            <select
                              value={t.status}
                              onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                              disabled={currentTab !== 'active'}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: '800',
                                cursor: currentTab === 'active' ? 'pointer' : 'default',
                                fontFamily: 'inherit',
                                backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : t.status === 'נדחה' ? '#fee2e2' : '#e0f2fe',
                                color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : t.status === 'נדחה' ? '#b91c1c' : '#0369a1'
                              }}
                            >
                              <option value="פתוח">פתוח</option>
                              <option value="בביצוע">בביצוע</option>
                              <option value="הושלם">הושלם</option>
                              <option value="נדחה">נדחה</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: isCompleted ? theme.textMuted : theme.textMain, textDecoration: isCompleted ? 'line-through' : 'none', lineHeight: '1.4' }}>
                              {t.description}
                            </div>
                            {currentTab === 'active' && (
                              <button
                                onClick={() => {
                                  setActiveSubTaskInputTaskId(activeSubTaskInputTaskId === t.id ? null : t.id);
                                  setSubTaskText('');
                                }}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  border: `1px solid ${theme.border}`,
                                  backgroundColor: theme.cardBg,
                                  color: '#2563eb',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 'bold',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 0
                                }}
                                title="הוסף תת-משימה"
                              >
                                +
                              </button>
                            )}
                          </div>

                          {activeSubTaskInputTaskId === t.id && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input
                                type="text"
                                value={subTaskText}
                                onChange={(e) => setSubTaskText(e.target.value)}
                                placeholder="שם תת-המשימה..."
                                autoFocus
                                style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.inputText, fontSize: '11px', outline: 'none' }}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddSubTaskDirect(t.id)}
                              />
                              <button
                                onClick={() => handleAddSubTaskDirect(t.id)}
                                style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                הוסף
                              </button>
                            </div>
                          )}

                          {/* תתי משימות */}
                          {(t.subtasks || []).length > 0 && (
                            <div style={{ backgroundColor: theme.cardBg, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {t.subtasks.map((s) => (
                                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={s.completed}
                                        onChange={() => handleToggleSubTask(t.id, s.id, s.completed)}
                                        disabled={currentTab === 'trash'}
                                      />
                                      <span style={{ textDecoration: s.completed ? 'line-through' : 'none', color: s.completed ? theme.textMuted : theme.textMain }}>
                                        {s.text}
                                      </span>
                                    </label>
                                    {currentTab !== 'trash' && (
                                      <button
                                        onClick={() => handleDeleteSubTask(t.id, s.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

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
                              💬 הערות ({t.notes?.filter(n => !n.isManagerOnly || userRole === 'מנהל').length || 0}):
                            </div>
                            <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                              {t.notes?.filter(n => !n.isManagerOnly || userRole === 'מנהל').map((n) => (
                                <div key={n.id} style={{ fontSize: '11px', backgroundColor: n.isManagerOnly ? (isDarkMode ? '#451a03' : '#fffbeb') : theme.subCardBg, padding: '5px 8px', borderRadius: '6px', border: n.isManagerOnly ? '1px solid #fcd34d' : `1px solid ${theme.border}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <span style={{ fontWeight: '700' }}>{n.author}</span>
                                      {n.isManagerOnly && (
                                        <span style={{ fontSize: '9px', backgroundColor: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '4px', marginRight: '4px' }}>🔒 למנהל</span>
                                      )}
                                      <span style={{ color: theme.textMuted, fontSize: '9px', marginRight: '4px' }}>{n.time}</span>
                                    </div>
                                    {currentTab === 'active' && (
                                      <div style={{ display: 'flex', gap: '2px' }}>
                                        <button onClick={() => setEditingNote({ taskId: t.id, noteId: n.id, text: n.text, isManagerOnly: n.isManagerOnly })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}>✏️</button>
                                        <button onClick={() => handleDeleteNote(t.id, n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#ef4444' }}>🗑️</button>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ color: theme.textMain }}>{n.text}</div>
                                </div>
                              ))}
                            </div>

                            {currentTab === 'active' && (
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
                              
                              {currentTab === 'active' && (
                                <>
                                  <button
                                    onClick={() => handleDuplicateTask(t)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                    title="שכפל משימה"
                                  >
                                    📋 שכפל
                                  </button>
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
                                    📦 ארכיב
                                  </button>
                                  <button
                                    onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    🗑️ סל מחזור
                                  </button>
                                </>
                              )}

                              {currentTab === 'archived' && (
                                <>
                                  <button
                                    onClick={() => handleToggleArchive(t.id, t.isArchived)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: '#2563eb', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    ↩️ החזר
                                  </button>
                                  <button
                                    onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    🗑️ סל מחזור
                                  </button>
                                </>
                              )}

                              {currentTab === 'trash' && (
                                <>
                                  <button
                                    onClick={() => handleToggleTrash(t.id, t.isDeleted)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#16a34a', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    ↩️ שחזר
                                  </button>
                                  <button
                                    onClick={() => handlePermanentDelete(t.id)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    ✕ מחק לצמיתות
                                  </button>
                                </>
                              )}

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
