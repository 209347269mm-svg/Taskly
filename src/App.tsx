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
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [selectedFilterProject, setSelectedFilterProject] = useState('כל הפרויקטים');
  const [statusFilter, setStatusFilter] = useState<string>('הכל');
  const [searchTerm, setSearchTerm] = useState('');

  // מודאלים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [activeNotesTask, setActiveNotesTask] = useState<Task | null>(null);

  // טופס משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // טופס פרויקט חדש
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  // הערה חדשה
  const [modalNoteText, setModalNoteText] = useState('');

  // חיבור אנונימי
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
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
    }, (err) => console.error("Projects fetch error:", err));

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
    }, (err) => console.error("Tasks fetch error:", err));

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
    if (!nameInput.trim()) return;
    localStorage.setItem('taskly_user', nameInput.trim());
    localStorage.setItem('taskly_role', roleInput);
    setCurrentUser(nameInput.trim());
    setUserRole(roleInput);
  };

  const handleLogout = () => {
    localStorage.removeItem('taskly_user');
    localStorage.removeItem('taskly_role');
    setCurrentUser(null);
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
    const timeFormatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newNotes = [...(activeNotesTask.notes || []), {
      text: modalNoteText.trim(),
      author: currentUser || 'אורח',
      time: timeFormatted
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
    if (!window.confirm("האם למחוק משימה זו?")) return;
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  const allProjectNames = useMemo(() => {
    return Array.from(new Set([...projects.map((p) => p.name), ...tasks.map((t) => t.project)]));
  }, [projects, tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchProject = selectedFilterProject === 'כל הפרויקטים' || t.project === selectedFilterProject;
      const matchStatus = statusFilter === 'הכל' || t.status === statusFilter;
      const matchSearch = searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      return matchProject && matchStatus && matchSearch;
    });
  }, [tasks, selectedFilterProject, statusFilter, searchTerm]);

  // מסך התחברות יוקרתי
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#ffffff', borderRadius: '28px', padding: '40px 32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', textAlign: 'center' }}>
          
          <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '28px', marginBottom: '20px', boxShadow: '0 10px 20px -5px rgba(59,130,246,0.5)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>כניסה למערכת</h2>
          <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 32px 0' }}>מרכז ניהול משימות ופרויקטים</p>

          <form onSubmit={handleLogin} style={{ textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
              שם מלא / כינוי
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="הזן שם מלא..."
              autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '14px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '15px', boxSizing: 'border-box', marginBottom: '24px', transition: 'border-color 0.2s', backgroundColor: '#f8fafc' }}
            />

            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#334155', marginBottom: '10px' }}>
              הרשאה
            </label>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '14px', padding: '6px', marginBottom: '28px' }}>
              <button
                type="button"
                onClick={() => setRoleInput('משתמש')}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#ffffff' : 'transparent', color: roleInput === 'משתמש' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'משתמש' ? '0 4px 12px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
              >
                משתמש
              </button>
              <button
                type="button"
                onClick={() => setRoleInput('מנהל')}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#ffffff' : 'transparent', color: roleInput === 'מנהל' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'מנהל' ? '0 4px 12px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
              >
                מנהל
              </button>
            </div>

            <button
              type="submit"
              style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', fontSize: '16px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 8px 20px -4px rgba(37,99,235,0.4)', transition: 'transform 0.1s' }}
            >
              התחבר עכשיו
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Navbar סרגל עליון מקצועי */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>
              ✓
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', lineHeight: 1.2 }}>Taskly Pro</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>מעקב משימות וניהול פרויקטים</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: '#f1f5f9', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{currentUser}</span>
              <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>{userRole}</span>
            </div>

            <button
              onClick={handleLogout}
              style={{ border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}
            >
              יציאה
            </button>
          </div>

        </div>
      </header>

      {/* אזור פעולות ראשי */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
        
        {/* בקרי שליטה וסינון */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', marginBottom: '28px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1, minWidth: '300px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש חופשי (משימה, אחראי, נושא)..."
              style={{ flex: 1, minWidth: '220px', padding: '12px 18px', borderRadius: '12px', border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', outline: 'none' }}
            />

            <select
              value={selectedFilterProject}
              onChange={(e) => setSelectedFilterProject(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', outline: 'none', fontWeight: '600', color: '#334155' }}
            >
              <option value="כל הפרויקטים">כל הפרויקטים ({tasks.length})</option>
              {allProjectNames.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', outline: 'none', fontWeight: '600', color: '#334155' }}
            >
              <option value="הכל">כל הסטטוסים</option>
              <option value="פתוח">פתוח</option>
              <option value="בביצוע">בביצוע</option>
              <option value="הושלם">הושלם</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowAddProjectModal(true)}
              style={{ padding: '12px 18px', backgroundColor: '#f1f5f9', color: '#334155', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}
            >
              📁 + פרויקט חדש
            </button>

            <button
              onClick={() => setShowAddTaskModal(true)}
              style={{ padding: '12px 22px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
            >
              + משימה חדשה
            </button>
          </div>

        </div>

        {/* רשימת הפרויקטים והמשימות */}
        {allProjectNames
          .filter((p) => selectedFilterProject === 'כל הפרויקטים' || selectedFilterProject === p)
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const projectDoc = projects.find((p) => p.name === projectName);

            return (
              <section key={projectName} style={{ marginBottom: '32px', backgroundColor: '#ffffff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                
                {/* Header פרויקט מעוצב */}
                <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '800' }}>
                      פרויקט
                    </span>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                    <span style={{ fontSize: '13px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '20px' }}>
                      {projectTasks.length} משימות
                    </span>
                  </div>

                  {projectDoc && (
                    <button
                      onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                    >
                      מחק פרויקט
                    </button>
                  )}
                </div>

                {projectTasks.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '15px' }}>
                    אין משימות להצגה בפרויקט זה.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'right', minWidth: '950px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '14px 18px', width: '140px' }}>נושא / תחום</th>
                          <th style={{ padding: '14px 18px' }}>תיאור משימה</th>
                          <th style={{ padding: '14px 18px', width: '140px' }}>אחראי</th>
                          <th style={{ padding: '14px 14px', width: '110px' }}>פתיחה</th>
                          <th style={{ padding: '14px 14px', width: '110px' }}>יעד</th>
                          <th style={{ padding: '14px 14px', width: '90px' }}>איחור</th>
                          <th style={{ padding: '14px 18px', width: '120px' }}>סטטוס</th>
                          <th style={{ padding: '14px 18px', width: '120px', textAlign: 'center' }}>הערות</th>
                          <th style={{ padding: '14px 14px', width: '50px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map((t) => {
                          const delayDays = calculateDelay(t.dueDate, t.status, t.completedDate);
                          const isCompleted = t.status === 'הושלם';

                          return (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isCompleted ? '#fafafa' : '#ffffff' }}>
                              
                              <td style={{ padding: '16px 18px', fontWeight: '700', color: '#2563eb' }}>
                                <span style={{ backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '8px', fontSize: '13px' }}>
                                  {t.topic}
                                </span>
                              </td>

                              <td style={{ padding: '16px 18px', fontWeight: '600', color: isCompleted ? '#94a3b8' : '#1e293b', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                                {t.description}
                              </td>

                              <td style={{ padding: '16px 18px' }}>
                                <span style={{ backgroundColor: '#f1f5f9', padding: '5px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                                  👤 {t.assignee}
                                </span>
                              </td>

                              <td style={{ padding: '16px 14px', color: '#64748b', fontSize: '13px' }}>
                                {t.startDate}
                              </td>

                              <td style={{ padding: '16px 14px', color: '#0f172a', fontWeight: '600', fontSize: '13px' }}>
                                📅 {t.dueDate}
                              </td>

                              <td style={{ padding: '16px 14px' }}>
                                {delayDays > 0 ? (
                                  <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>
                                    {delayDays} ימים!
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>

                              <td style={{ padding: '16px 18px' }}>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    fontSize: '13px',
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

                              <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                                <button
                                  onClick={() => setActiveNotesTask(t)}
                                  style={{ border: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#334155' }}
                                >
                                  💬 ({t.notes?.length || 0})
                                </button>
                              </td>

                              <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleDeleteTask(t.id)}
                                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                  title="מחק משימה"
                                >
                                  ✕
                                </button>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

              </section>
            );
          })}

      </main>

      {/* מודאל צפייה והוספת הערות בסגנון צ'אט */}
      {activeNotesTask && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '500px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>הערות למשימה</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{activeNotesTask.description}</p>
              </div>
              <button onClick={() => setActiveNotesTask(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {/* רשימת הערות */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(activeNotesTask.notes || []).length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', margin: 'auto' }}>אין עדיין הערות למשימה זו.</p>
              ) : (
                activeNotesTask.notes.map((n, idx) => (
                  <div key={idx} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b' }}>{n.author}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{n.time}</span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#334155', whiteSpace: 'pre-wrap' }}>{n.text}</div>
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
                style={{ flex: 1, padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNoteToActive()}
              />
              <button
                onClick={handleAddNoteToActive}
                style={{ padding: '12px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}
              >
                שלח
              </button>
            </div>

          </div>
        </div>
      )}

      {/* מודאל יצירת פרויקט */}
      {showAddProjectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '420px', textAlign: 'right' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '800' }}>יצירת פרויקט חדש</h3>
            <form onSubmit={handleCreateProject}>
              <input
                type="text"
                value={newProjectNameInput}
                onChange={(e) => setNewProjectNameInput(e.target.value)}
                placeholder="שם הפרויקט..."
                autoFocus
                style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '15px', boxSizing: 'border-box', marginBottom: '24px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  צור פרויקט
                </button>
                <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '14px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל יצירת משימה */}
      {showAddTaskModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '520px', textAlign: 'right' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '22px', fontWeight: '800' }}>הוספת משימה חדשה</h3>
            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>פרויקט:</label>
                <select
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', backgroundColor: '#fff', fontSize: '14px' }}
                >
                  {allProjectNames.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>נושא / מודול:</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="למשל: בדיקות, חומרה, רכש..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>תיאור המשימה:</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="מה בדיוק צריך לבצע?"
                  rows={3}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>אחראי:</label>
                  <input
                    type="text"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    placeholder="שם האחראי..."
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>תאריך יעד:</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  שמור משימה
                </button>
                <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '14px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
