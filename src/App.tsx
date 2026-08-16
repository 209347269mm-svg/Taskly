import React, { useState, useEffect } from 'react';
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
  delayDays: number;
  status: 'פתוח' | 'בביצוע' | 'הושלם';
  notes: Array<{ text: string; author: string; time: string }>;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [userRole, setUserRole] = useState<'משתמש' | 'מנהל'>(() => (localStorage.getItem('taskly_role') as any) || 'משתמש');
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'משתמש' | 'מנהל'>('משתמש');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<string[]>(['MBDA', 'אוקראינה', 'הולנד']);
  const [selectedFilterProject, setSelectedFilterProject] = useState('כל הפרויקטים');
  const [searchTerm, setSearchTerm] = useState('');

  // שדות להוספת משימה חדשה
  const [showAddTask, setShowAddTask] = useState(false);
  const [newProject, setNewProject] = useState('MBDA');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // שדה להוספת הערה זמנית
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});

  // כניסה אנונימית ברקע ל-Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // האזנה למשימות בזמן אמת
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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription.trim()) return;

    const todayStr = new Date().toISOString().split('T')[0];
    await addDoc(collection(db, 'tasks'), {
      project: newProject,
      topic: newTopic.trim() || 'כללי',
      description: newDescription.trim(),
      assignee: newAssignee.trim() || currentUser,
      startDate: todayStr,
      dueDate: newDueDate || todayStr,
      completedDate: '',
      delays: 0,
      delayDays: 0,
      status: 'פתוח',
      notes: [],
      createdAt: serverTimestamp()
    });

    setNewDescription('');
    setNewTopic('');
    setShowAddTask(false);
  };

  const handleAddNote = async (taskId: string) => {
    const text = noteInputs[taskId]?.trim();
    if (!text) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const timeFormatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newNotes = [...(task.notes || []), { text, author: currentUser || 'אורח', time: timeFormatted }];

    await updateDoc(doc(db, 'tasks', taskId), {
      notes: newNotes
    });

    setNoteInputs({ ...noteInputs, [taskId]: '' });
  };

  const handleStatusChange = async (taskId: string, newStatus: 'פתוח' | 'בביצוע' | 'הושלם') => {
    const todayStr = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : ''
    });
  };

  // מסך התחברות
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          
          <div style={{ width: '56px', height: '56px', backgroundColor: '#2563eb', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px' }}>
            👤
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>כניסה לאפליקציה</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0' }}>הזן את שמך ובחר את סוג החשבון להתחברות</p>

          <form onSubmit={handleLogin} style={{ textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              שם מלא / שם משתמש
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="הזן שם מלא..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px', boxSizing: 'border-box', marginBottom: '20px' }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              סוג הרשאה
            </label>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => setRoleInput('משתמש')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#ffffff' : 'transparent', color: roleInput === 'משתמש' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'משתמש' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
              >
                משתמש
              </button>
              <button
                type="button"
                onClick={() => setRoleInput('מנהל')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#ffffff' : 'transparent', color: roleInput === 'מנהל' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'מנהל' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
              >
                מנהל
              </button>
            </div>

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  const filteredTasks = tasks.filter((t) => {
    const matchProject = selectedFilterProject === 'כל הפרויקטים' || t.project === selectedFilterProject;
    const matchSearch = searchTerm === '' || 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
    return matchProject && matchSearch;
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '20px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header סרגל עליון */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '20px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <span>{currentUser}</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>({userRole})</span>
            <span>🚪</span>
          </button>
          <button style={{ border: '1px solid #e2e8f0', background: '#ffffff', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📊 טבלה מקובצת
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>ניהול משימות לפי פרויקטים</h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>מערכת מעקב משימות ונושאים היררכית (מחובר בזמן אמת)</span>
          </div>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#2563eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
            ✨
          </div>
        </div>

      </div>

      {/* סרגל חיפוש וסינון */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <select
          value={selectedFilterProject}
          onChange={(e) => setSelectedFilterProject(e.target.value)}
          style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none' }}
        >
          <option value="כל הפרויקטים">כל הפרויקטים</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="חיפוש משימה / אחראי / נושא..."
          style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none' }}
        />

        <button
          onClick={() => setShowAddTask(!showAddTask)}
          style={{ padding: '10px 18px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}
        >
          + משימה חדשה
        </button>
      </div>

      {/* טופס משימה חדשה */}
      {showAddTask && (
        <form onSubmit={handleCreateTask} style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <select value={newProject} onChange={(e) => setNewProject(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="text" placeholder="נושא / מודול" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} style={{ flex: 1, minWidth: '150px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <input type="text" placeholder="תיאור המשימה..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} style={{ flex: 2, minWidth: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <input type="text" placeholder="אחראי" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} style={{ width: '120px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>שמור</button>
          <button type="button" onClick={() => setShowAddTask(false)} style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>ביטול</button>
        </form>
      )}

      {/* תצוגת הפרויקטים והטבלאות */}
      {projects.filter((p) => selectedFilterProject === 'כל הפרויקטים' || selectedFilterProject === p).map((projectName) => {
        const projectTasks = filteredTasks.filter((t) => t.project === projectName);

        return (
          <div key={projectName} style={{ marginBottom: '24px', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
            
            {/* כותרת פרויקט */}
            <div style={{ backgroundColor: '#1e293b', color: '#ffffff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ backgroundColor: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>פרויקט</span>
                <span style={{ fontSize: '16px', fontWeight: '700' }}>{projectName}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>({projectTasks.length} משימות)</span>
              </div>
            </div>

            {/* טבלת משימות */}
            {projectTasks.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                אין עדיין משימות בפרויקט זה.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '12px 14px' }}>נושא משותף</th>
                      <th style={{ padding: '12px 14px' }}>משימה (תיאור)</th>
                      <th style={{ padding: '12px 14px' }}>אחראים</th>
                      <th style={{ padding: '12px 14px' }}>תאריך פתיחה</th>
                      <th style={{ padding: '12px 14px' }}>תאריך יעד</th>
                      <th style={{ padding: '12px 14px' }}>השלמה בפועל</th>
                      <th style={{ padding: '12px 14px' }}>דחיות</th>
                      <th style={{ padding: '12px 14px' }}>ימי איחור</th>
                      <th style={{ padding: '12px 14px' }}>סטטוס</th>
                      <th style={{ padding: '12px 14px', width: '220px' }}>הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectTasks.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: '600', color: '#2563eb' }}>{t.topic}</td>
                        <td style={{ padding: '12px 14px', color: '#0f172a', fontWeight: '500' }}>{t.description}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '12px', fontSize: '12px' }}>👤 {t.assignee}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{t.startDate}</td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>📅 {t.dueDate}</td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{t.completedDate || '-'}</td>
                        <td style={{ padding: '12px 14px', color: '#ea580c', fontWeight: '600' }}>{t.delays || '-'}</td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{t.delayDays || '-'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <select
                            value={t.status}
                            onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: t.status === 'הושלם' ? '#dcfce7' : t.status === 'בביצוע' ? '#fef9c3' : '#e0f2fe', color: t.status === 'הושלם' ? '#166534' : t.status === 'בביצוע' ? '#854d0e' : '#0369a1', fontWeight: 'bold' }}
                          >
                            <option value="פתוח">פתוח</option>
                            <option value="בביצוע">בביצוע</option>
                            <option value="הושלם">הושלם</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {/* רשימת הערות קיימות */}
                          <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '6px' }}>
                            {(t.notes || []).map((n, idx) => (
                              <div key={idx} style={{ fontSize: '11px', backgroundColor: '#f8fafc', padding: '4px 6px', borderRadius: '4px', marginBottom: '4px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontWeight: 'bold', color: '#334155' }}>{n.author}: </span>
                                <span>{n.text}</span>
                              </div>
                            ))}
                          </div>

                          {/* הוספת הערה חדשה */}
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
                              style={{ padding: '4px 8px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              שלח
                            </button>
                          </div>
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
  );
}
