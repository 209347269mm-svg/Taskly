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
  
  // שדות התחברות
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
  
  // סינון
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('הכל');
  const [searchTerm, setSearchTerm] = useState('');

  // מודאלים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [activeNotesTask, setActiveNotesTask] = useState<Task | null>(null);
  const [modalNoteText, setModalNoteText] = useState('');

  // טופס משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  // חיבור אנונימי ברקע
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
      const fetched: Task[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any)
      }));
      setTasks(fetched);
    }, (err) => console.error("Tasks error:", err));
    return () => unsubscribe();
  }, []);

  // חישוב ימי איחור
  const calculateDelay = (dueDate: string, status: string, completedDate?: string) => {
    if (!dueDate) return 0;
    const due = new Date(dueDate).getTime();
    const end = status === 'הושלם' && completedDate ? new Date(completedDate).getTime() : new Date().setHours(0,0,0,0);
    const diffDays = Math.ceil((end - due) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
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

    await setDoc(doc(db, 'settings', 'admin_config'), {
      adminPassword: trimmed
    }, { merge: true });

    alert('סיסמת המנהל עודכנה בהצלחה!');
    setNewAdminPasswordInput('');
    setShowPasswordChangeModal(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!window.confirm(`האם למחוק את הפרויקט "${projectName}"?`)) return;
    await deleteDoc(doc(db, 'projects_list', projectId));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
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
      status: 'פתוח',
      notes: [],
      createdAt: serverTimestamp()
    });

    setNewDescription('');
    setNewTopic('');
    setNewDueDate('');
    setShowAddTaskModal(false);
  };

  const handleAddNoteToActive = async () => {
    if (!modalNoteText.trim() || !activeNotesTask) return;

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const fullTimestamp = `${formattedDate} ${formattedTime}`;

    const newNotes = [...(activeNotesTask.notes || []), {
      text: modalNoteText.trim(),
      author: currentUser || 'אורח',
      time: fullTimestamp
    }];

    await updateDoc(doc(db, 'tasks', activeNotesTask.id), { notes: newNotes });
    setActiveNotesTask({ ...activeNotesTask, notes: newNotes });
    setModalNoteText('');
  };

  const handleStatusChange = async (taskId: string, newStatus: 'פתוח' | 'בביצוע' | 'הושלם') => {
    const todayStr = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : ''
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("למחוק משימה זו?")) return;
    await deleteDoc(doc(db, 'tasks', taskId));
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
      const matchProject = selectedProjects.length === 0 || selectedProjects.includes(t.project);
      const matchStatus = statusFilter === 'הכל' || t.status === statusFilter;
      const matchSearch = searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      return matchProject && matchStatus && matchSearch;
    });
  }, [tasks, selectedProjects, statusFilter, searchTerm]);

  // סטטיסטיקות
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'הושלם').length;
    const inProgress = tasks.filter((t) => t.status === 'בביצוע').length;
    const open = tasks.filter((t) => t.status === 'פתוח').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, open, rate };
  }, [tasks]);

  // מסך התחברות
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090d16', padding: '20px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#111827', borderRadius: '28px', padding: '40px 32px', border: '1px solid #1f2937', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', textAlign: 'center' }}>
          
          <div style={{ width: '64px', height: '64px', backgroundColor: '#2563eb', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '28px', marginBottom: '20px', boxShadow: '0 10px 25px -5px rgba(37,99,235,0.5)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#f9fafb', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Taskly Pro</h2>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 28px 0' }}>מערכת לניהול ומעקב משימות</p>

          {authError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'right' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '8px' }}>
                שם מלא / כינוי
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הזן את שמך..."
                autoFocus
                style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '8px' }}>
                סוג הרשאה
              </label>
              <div style={{ display: 'flex', backgroundColor: '#1f2937', borderRadius: '12px', padding: '5px', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setRoleInput('משתמש')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#2563eb' : 'transparent', color: roleInput === 'משתמש' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  משתמש (ישיר)
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('מנהל')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#2563eb' : 'transparent', color: roleInput === 'מנהל' ? '#ffffff' : '#9ca3af', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  מנהל (סיסמה)
                </button>
              </div>
            </div>

            {roleInput === 'מנהל' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#e5e7eb', marginBottom: '8px' }}>
                  סיסמת מנהל
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="הזן סיסמת מנהל (ברירת מחדל: 1234)..."
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid #374151', backgroundColor: '#1f2937', color: '#ffffff', outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <button
              type="submit"
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '16px', fontWeight: '800', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 14px rgba(37,99,235,0.4)' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', padding: '24px 16px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Header סרגל עליון */}
        <header style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '18px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>{currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>{userRole}</span>
            </div>

            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowPasswordChangeModal(true)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: '#334155' }}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>Taskly Pro</h1>
              <span style={{ fontSize: '12px', color: '#64748b' }}>מעקב משימות וניהול פרויקטים</span>
            </div>
            <div style={{ width: '44px', height: '44px', backgroundColor: '#2563eb', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '22px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
              ⚡
            </div>
          </div>

        </header>

        {/* Widgets מדדים וסטטיסטיקה */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>סך הכל משימות</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>{stats.total}</div>
          </div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0284c7', marginBottom: '4px' }}>בביצוע</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0284c7' }}>{stats.inProgress}</div>
          </div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a', marginBottom: '4px' }}>הושלמו</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a' }}>{stats.completed}</div>
          </div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#6366f1', marginBottom: '4px' }}>אחוז ביצוע</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#6366f1' }}>{stats.rate}%</div>
          </div>
        </div>

        {/* סרגל בחירת מספר פרויקטים (Multi-Select Chips) */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>
              📁 בחירת פרויקטים להצגה (ניתן לבחור מספר פרויקטים במקביל):
            </span>
            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowAddProjectModal(true)}
                style={{ padding: '7px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px', fontWeight: '800', color: '#2563eb', cursor: 'pointer' }}
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
                border: selectedProjects.length === 0 ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: selectedProjects.length === 0 ? '#2563eb' : '#ffffff',
                color: selectedProjects.length === 0 ? '#ffffff' : '#334155',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              כל הפרויקטים ({tasks.length})
            </button>

            {allProjectNames.map((pName) => {
              const isSelected = selectedProjects.includes(pName);
              const count = tasks.filter((t) => t.project === pName).length;

              return (
                <button
                  key={pName}
                  onClick={() => toggleProjectSelection(pName)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '20px',
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#2563eb' : '#475569',
                    fontWeight: isSelected ? '800' : '600',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{isSelected ? '✓ ' : ''}{pName}</span>
                  <span style={{ fontSize: '11px', opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* שורת חיפוש, סינון סטטוס והוספת משימה */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש חופשי (משימה, אחראי, נושא)..."
            style={{ flex: 1, minWidth: '220px', padding: '12px 18px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', fontWeight: '700', color: '#334155' }}
          >
            <option value="הכל">כל הסטטוסים</option>
            <option value="פתוח">פתוח</option>
            <option value="בביצוע">בביצוע</option>
            <option value="הושלם">הושלם</option>
          </select>

          <button
            onClick={() => setShowAddTaskModal(true)}
            style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
          >
            + משימה חדשה
          </button>
        </div>

        {/* מודאל צפייה והוספת הערות (צ'אט) */}
        {activeNotesTask && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>הערות למשימה</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{activeNotesTask.description}</p>
                </div>
                <button onClick={() => setActiveNotesTask(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
              </div>

              {/* רשימת הערות */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(activeNotesTask.notes || []).length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', margin: 'auto' }}>אין עדיין הערות למשימה זו.</p>
                ) : (
                  activeNotesTask.notes.map((n, idx) => (
                    <div key={idx} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '800', fontSize: '13px', color: '#1e293b' }}>👤 {n.author}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>🕒 {n.time}</span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{n.text}</div>
                    </div>
                  ))
                )}
              </div>

              {/* הזנת הערה */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={modalNoteText}
                  onChange={(e) => setModalNoteText(e.target.value)}
                  placeholder="כתוב הערה..."
                  style={{ flex: 1, padding: '12px 14px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNoteToActive()}
                />
                <button
                  onClick={handleAddNoteToActive}
                  style={{ padding: '12px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}
                >
                  שלח
                </button>
              </div>

            </div>
          </div>
        )}

        {/* מודאל שינוי סיסמת מנהל */}
        {showPasswordChangeModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>שינוי סיסמת מנהל</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>הסיסמה תתעדכן בענן עבור כל המנהלים</p>
              <form onSubmit={handleUpdateAdminPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  value={newAdminPasswordInput}
                  onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                  placeholder="הקלד סיסמה חדשה..."
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור סיסמה
                  </button>
                  <button type="button" onClick={() => setShowPasswordChangeModal(false)} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל פרויקט חדש */}
        {showAddProjectModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>הוספת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="שם הפרויקט (למשל: רכש, פיתוח, אלתא...)"
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '12px 18px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל משימה חדשה */}
        {showAddTaskModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '500px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 18px 0', fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>פרויקט:</label>
                  <select
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', fontSize: '14px' }}
                  >
                    {allProjectNames.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>נושא / תת-נושא:</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="למשל: תוכנה, חומרה, בדיקות..."
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תיאור המשימה:</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה נדרש לבצע?"
                    rows={3}
                    style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="שם האחראי..."
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תאריך יעד:</label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 18px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* תצוגת הפרויקטים והטבלאות */}
        {allProjectNames
          .filter((p) => selectedProjects.length === 0 || selectedProjects.includes(p))
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const projectDoc = projects.find((p) => p.name === projectName);

            return (
              <div key={projectName} style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '28px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
                
                {/* כותרת פרויקט */}
                <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: '#2563eb', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>פרויקט</span>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                    <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '12px' }}>
                      {projectTasks.length} משימות
                    </span>
                  </div>

                  {projectDoc && userRole === 'מנהל' && (
                    <button
                      onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                      style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                    >
                      🗑️ מחק פרויקט
                    </button>
                  )}
                </div>

                {/* טבלה */}
                {projectTasks.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    אין משימות להצגה בפרויקט זה.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '950px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '14px 16px', width: '130px' }}>נושא משותף</th>
                          <th style={{ padding: '14px 16px' }}>משימה (תיאור)</th>
                          <th style={{ padding: '14px 16px', width: '130px' }}>אחראים</th>
                          <th style={{ padding: '14px 12px', width: '100px' }}>פתיחה</th>
                          <th style={{ padding: '14px 12px', width: '110px' }}>יעד</th>
                          <th style={{ padding: '14px 12px', width: '90px' }}>איחור</th>
                          <th style={{ padding: '14px 16px', width: '110px' }}>סטטוס</th>
                          <th style={{ padding: '14px 16px', width: '120px', textAlign: 'center' }}>הערות</th>
                          <th style={{ padding: '14px 10px', textAlign: 'center', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map((t) => {
                          const delayDays = calculateDelay(t.dueDate, t.status, t.completedDate);
                          const isCompleted = t.status === 'הושלם';

                          return (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isCompleted ? '#fafafa' : '#ffffff' }}>
                              
                              <td style={{ padding: '14px 16px', fontWeight: '800', color: '#2563eb' }}>
                                <span style={{ backgroundColor: '#eff6ff', padding: '3px 8px', borderRadius: '6px' }}>
                                  {t.topic}
                                </span>
                              </td>

                              <td style={{ padding: '14px 16px', fontWeight: '600', color: isCompleted ? '#94a3b8' : '#0f172a', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                                {t.description}
                              </td>

                              <td style={{ padding: '14px 16px' }}>
                                <span style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', color: '#334155', fontWeight: '700' }}>
                                  👤 {t.assignee}
                                </span>
                              </td>

                              <td style={{ padding: '14px 12px', color: '#64748b', fontSize: '12px' }}>
                                {t.startDate}
                              </td>

                              <td style={{ padding: '14px 12px', color: '#0f172a', fontWeight: '700', fontSize: '12px' }}>
                                📅 {t.dueDate}
                              </td>

                              <td style={{ padding: '14px 12px' }}>
                                {delayDays > 0 ? (
                                  <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' }}>
                                    {delayDays} ימים!
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>

                              <td style={{ padding: '14px 16px' }}>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : '#e0f2fe',
                                    color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : '#0369a1'
                                  }}
                                >
                                  <option value="פתוח">פתוח</option>
                                  <option value="בביצוע">בביצוע</option>
                                  <option value="הושלם">הושלם</option>
                                </select>
                              </td>

                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                <button
                                  onClick={() => setActiveNotesTask(t)}
                                  style={{ border: '1px solid #cbd5e1', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#334155' }}
                                >
                                  💬 ({t.notes?.length || 0})
                                </button>
                              </td>

                              <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                                {userRole === 'מנהל' && (
                                  <button
                                    onClick={() => handleDeleteTask(t.id)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '15px' }}
                                    title="מחק משימה"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            );
          })}

      </div>
    </div>
  );
}
