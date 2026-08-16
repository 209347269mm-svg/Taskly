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
  
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');
  const [authError, setAuthError] = useState('');

  const [adminPassword, setAdminPassword] = useState('1234');
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [selectedFilterProject, setSelectedFilterProject] = useState('כל הפרויקטים');
  const [searchTerm, setSearchTerm] = useState('');

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);

  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});

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
        name: d.data().name as string
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
      const fetched: Task[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any)
      }));
      setTasks(fetched);
    }, (err) => console.error("Tasks error:", err));
    return () => unsubscribe();
  }, []);

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

  const handleAddNote = async (taskId: string) => {
    const text = noteInputs[taskId]?.trim();
    if (!text) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const timeFormatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newNotes = [...(task.notes || []), {
      text,
      author: currentUser || 'אורח',
      time: timeFormatted
    }];

    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setNoteInputs({ ...noteInputs, [taskId]: '' });
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchProject = selectedFilterProject === 'כל הפרויקטים' || t.project === selectedFilterProject;
      const matchSearch = searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      return matchProject && matchSearch;
    });
  }, [tasks, selectedFilterProject, searchTerm]);

  // מסך התחברות מעוצב
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', padding: '16px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#ffffff', borderRadius: '20px', padding: '36px 28px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          
          <div style={{ width: '56px', height: '56px', backgroundColor: '#2563eb', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px' }}>
            👤
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>כניסה לאפליקציה</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0' }}>הזן את שמך ובחר את סוג החשבון להתחברות</p>

          {authError && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', marginBottom: '18px', textAlign: 'right' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                שם מלא / שם משתמש
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הזן שם מלא..."
                autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                סוג הרשאה
              </label>
              <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setRoleInput('משתמש')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#ffffff' : 'transparent', color: roleInput === 'משתמש' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'משתמש' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
                >
                  משתמש (ישיר)
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('מנהל')}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#ffffff' : 'transparent', color: roleInput === 'מנהל' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'מנהל' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
                >
                  מנהל (סיסמה)
                </button>
              </div>
            </div>

            {roleInput === 'מנהל' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  סיסמת מנהל
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="הזן סיסמת מנהל (ברירת מחדל: 1234)..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '20px 16px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header סרגל עליון */}
        <header style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: '#f1f5f9', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>👤 {currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>{userRole}</span>
            </div>

            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowPasswordChangeModal(true)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', color: '#334155' }}
              >
                🔑 שינוי סיסמת מנהל
              </button>
            )}

            <button
              onClick={handleLogout}
              style={{ border: '1px solid #fee2e2', backgroundColor: '#fef2f2', color: '#ef4444', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
            >
              יציאה
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 }}>ניהול משימות לפי פרויקטים</h1>
              <span style={{ fontSize: '12px', color: '#64748b' }}>מערכת מעקב משימות ונושאים היררכית (מחובר בזמן אמת)</span>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#2563eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
              ⚡
            </div>
          </div>

        </header>

        {/* סרגל חיפוש ופעולות */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          
          <select
            value={selectedFilterProject}
            onChange={(e) => setSelectedFilterProject(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', fontWeight: '600', color: '#334155' }}
          >
            <option value="כל הפרויקטים">כל הפרויקטים ({tasks.length})</option>
            {allProjectNames.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש משימה, אחראי או נושא..."
            style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none' }}
          />

          {userRole === 'מנהל' && (
            <button
              onClick={() => setShowAddProjectModal(true)}
              style={{ padding: '10px 14px', backgroundColor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}
            >
              📁 + פרויקט חדש
            </button>
          )}

          <button
            onClick={() => setShowAddTaskModal(true)}
            style={{ padding: '10px 18px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', boxShadow: '0 2px 6px rgba(37,99,235,0.3)' }}
          >
            + משימה חדשה
          </button>
        </div>

        {/* מודאל שינוי סיסמה */}
        {showPasswordChangeModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>שינוי סיסמת מנהל</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>הסיסמה החדשה תישמר בענן עבור כל המנהלים</p>
              <form onSubmit={handleUpdateAdminPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  value={newAdminPasswordInput}
                  onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                  placeholder="הקלד סיסמה חדשה..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור סיסמה
                  </button>
                  <button type="button" onClick={() => setShowPasswordChangeModal(false)} style={{ padding: '10px 14px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל יצירת פרויקט */}
        {showAddProjectModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>יצירת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="שם הפרויקט..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '10px 14px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל יצירת משימה */}
        {showAddTaskModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '480px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>פרויקט:</label>
                  <select
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', fontSize: '14px' }}
                  >
                    {allProjectNames.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>נושא / תת-נושא:</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="למשל: תוכנה, חומרה, בדיקות..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תיאור המשימה:</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה נדרש לבצע?"
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="שם האחראי..."
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תאריך יעד:</label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* תצוגת הפרויקטים והטבלאות */}
        {allProjectNames
          .filter((p) => selectedFilterProject === 'כל הפרויקטים' || selectedFilterProject === p)
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const projectDoc = projects.find((p) => p.name === projectName);

            return (
              <div key={projectName} style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                
                {/* כותרת פרויקט */}
                <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ backgroundColor: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>פרויקט</span>
                    <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>{projectName}</h2>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>({projectTasks.length} משימות)</span>
                  </div>

                  {projectDoc && userRole === 'מנהל' && (
                    <button
                      onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}
                    >
                      🗑️ מחק פרויקט
                    </button>
                  )}
                </div>

                {/* טבלה */}
                {projectTasks.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    אין עדיין משימות בפרויקט זה.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '900px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '12px 14px' }}>נושא משותף</th>
                          <th style={{ padding: '12px 14px' }}>משימה (תיאור)</th>
                          <th style={{ padding: '12px 14px' }}>אחראים</th>
                          <th style={{ padding: '12px 12px' }}>תאריך פתיחה</th>
                          <th style={{ padding: '12px 12px' }}>תאריך יעד</th>
                          <th style={{ padding: '12px 14px' }}>סטטוס</th>
                          <th style={{ padding: '12px 14px', minWidth: '220px' }}>הערות</th>
                          <th style={{ padding: '12px 10px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map((t) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            
                            <td style={{ padding: '12px 14px', fontWeight: '700', color: '#2563eb' }}>
                              {t.topic}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: '500', color: '#0f172a' }}>
                              {t.description}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', color: '#334155' }}>
                                👤 {t.assignee}
                              </span>
                            </td>

                            <td style={{ padding: '12px 12px', color: '#64748b', fontSize: '12px' }}>
                              {t.startDate}
                            </td>

                            <td style={{ padding: '12px 12px', color: '#0f172a', fontWeight: '600', fontSize: '12px' }}>
                              📅 {t.dueDate}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <select
                                value={t.status}
                                onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  fontSize: '12px',
                                  fontWeight: '700',
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

                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ maxHeight: '70px', overflowY: 'auto', marginBottom: '6px' }}>
                                {(t.notes || []).map((n, idx) => (
                                  <div key={idx} style={{ fontSize: '11px', backgroundColor: '#f8fafc', padding: '4px 6px', borderRadius: '4px', marginBottom: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: '700', color: '#334155' }}>{n.author}: </span>
                                    <span>{n.text}</span>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input
                                  type="text"
                                  value={noteInputs[t.id] || ''}
                                  onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })}
                                  placeholder="הוסף הערה..."
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                                />
                                <button
                                  onClick={() => handleAddNote(t.id)}
                                  style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                  שלח
                                </button>
                              </div>
                            </td>

                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                              {userRole === 'מנהל' && (
                                <button
                                  onClick={() => handleDeleteTask(t.id)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                                  title="מחק משימה"
                                >
                                  ✕
                                </button>
                              )}
                            </td>

                          </tr>
                        ))}
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
