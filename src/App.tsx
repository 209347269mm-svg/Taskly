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

// ... (Interface definitions remain the same)
interface NoteItem { id: string; text: string; author: string; time: string; }
interface Task { id: string; project: string; topic: string; description: string; assignee: string; startDate: string; dueDate: string; completedDate?: string; delays: number; priority: 'נמוכה' | 'בינונית' | 'גבוהה'; isArchived: boolean; isDeleted: boolean; orderIndex?: number; status: 'פתוח' | 'בביצוע' | 'הושלם' | 'נדחה'; notes: NoteItem[]; subtasks: any[]; }
interface ProjectDoc { id: string; name: string; color?: string; }

const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#4f46e5'];
const FONT_FAMILY = "'Assistant', 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [userRole, setUserRole] = useState<'משתמש' | 'מנהל'>(() => (localStorage.getItem('taskly_role') as any) || 'משתמש');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');

  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');
  const [authError, setAuthError] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // שינוי סיסמה
  const [adminPassword, setAdminPassword] = useState('123456');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  // בחירת פרויקטים מרובים
  const [selectedProjectFilters, setSelectedProjectFilters] = useState<string[]>(['הכל']);

  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'calendar' | 'dashboard'>('table');
  const [currentTab, setCurrentTab] = useState<'active' | 'archived' | 'trash'>('active');
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
          notes: (data.notes || []),
          subtasks: (data.subtasks || [])
        };
      });
      setTasks(fetched);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roleInput === 'מנהל' && passwordInput !== adminPassword) {
      setAuthError('סיסמת מנהל שגויה.');
      return;
    }
    localStorage.setItem('taskly_user', nameInput.trim());
    localStorage.setItem('taskly_role', roleInput);
    setCurrentUser(nameInput.trim());
    setUserRole(roleInput);
  };

  const handleUpdatePassword = async () => {
    if (!newPasswordInput) return;
    await updateDoc(doc(db, 'settings', 'admin_config'), { adminPassword: newPasswordInput });
    alert("הסיסמה עודכנה!");
    setShowPasswordModal(false);
  };

  const allProjectNames = useMemo(() => Array.from(new Set(projects.map((p) => p.name))), [projects]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchTab = currentTab === 'trash' ? t.isDeleted : currentTab === 'archived' ? (!t.isDeleted && t.isArchived) : (!t.isDeleted && !t.isArchived);
      // תמיכה בבחירת פרויקטים מרובים
      const matchProject = selectedProjectFilters.includes('הכל') || selectedProjectFilters.includes(t.project);
      const matchStatus = statusFilter === 'הכל' || t.status === statusFilter;
      const matchPriority = priorityFilter === 'הכל' || t.priority === priorityFilter;
      const matchSearch = searchTerm === '' || t.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchTab && matchProject && matchStatus && matchPriority && matchSearch;
    });
  }, [tasks, currentTab, selectedProjectFilters, statusFilter, priorityFilter, searchTerm]);

  // --- (פונקציות העזר handleDuplicate, handleToggle וכו' נשארות כשהיו בקוד הקודם) ---
  const handleDuplicateTask = async (t: Task) => {
    await addDoc(collection(db, 'tasks'), { ...t, description: `${t.description} (עותק)`, status: 'פתוח', createdAt: serverTimestamp() });
  };
  const handleToggleArchive = async (id: string, val: boolean) => await updateDoc(doc(db, 'tasks', id), { isArchived: !val });
  const handleToggleTrash = async (id: string, val: boolean) => await updateDoc(doc(db, 'tasks', id), { isDeleted: !val });
  const handlePermanentDelete = async (id: string) => await deleteDoc(doc(db, 'tasks', id));
  const handleSaveEditedTask = async (e: React.FormEvent) => { e.preventDefault(); if (editingTask) await updateDoc(doc(db, 'tasks', editingTask.id), { ...editingTask }); setEditingTask(null); };

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

  // --- UI ---
  // (הוסף כאן את ה-return של מסך הכניסה והמערכת הראשי בהתאם למבנה הקוד הקודם...)
  // עבור החלק של בחירת פרויקטים מרובים ב-Header:
  /*
  <select multiple value={selectedProjectFilters} onChange={(e) => {
    const values = Array.from(e.target.selectedOptions, option => option.value);
    setSelectedProjectFilters(values.includes('הכל') ? ['הכל'] : values);
  }}>
     <option value="הכל">כל הפרויקטים</option>
     {allProjectNames.map(p => <option key={p} value={p}>{p}</option>)}
  </select>
  */
  
  return <div style={{ minHeight: '100vh', backgroundColor: theme.bg, padding: '20px' }}> {/* ... */} </div>;
}
