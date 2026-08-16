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
  delays: number;
  delayDays: number;
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
  const [searchTerm, setSearchTerm] = useState('');

  // מודאלים וטפסים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);

  // נתוני משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // נתוני פרויקט חדש
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  // שדה להזנת הערה זמנית
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});

  // חיבור אנונימי
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // טעינת פרויקטים מ-Firestore
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

  // טעינת משימות מ-Firestore
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

  // הוספת פרויקט
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

  // מחיקת פרויקט
  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!window.confirm(`האם למחוק את הפרויקט "${projectName}"? המשימות שלו עדיין יישמרו.`)) return;
    await deleteDoc(doc(db, 'projects_list', projectId));
  };

  // יצירת משימה
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
      delays: 0,
      delayDays: 0,
      status: 'פתוח',
      notes: [],
      createdAt: serverTimestamp()
    });

    setNewDescription('');
    setNewTopic('');
    setNewDueDate('');
    setShowAddTaskModal(false);
  };

  // הוספת הערה
  const handleAddNote = async (taskId: string) => {
    const text = noteInputs[taskId]?.trim();
    if (!text) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const timeFormatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newNotes = [...(task.notes || []), { text, author: currentUser || 'אורח', time: timeFormatted }];

    await updateDoc(doc(db, 'tasks', taskId), { notes: newNotes });
    setNoteInputs({ ...noteInputs, [taskId]: '' });
  };

  // שינוי סטטוס
  const handleStatusChange = async (taskId: string, newStatus: 'פתוח' | 'בביצוע' | 'הושלם') => {
    const todayStr = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      completedDate: newStatus === 'הושלם' ? todayStr : ''
    });
  };

  // מחיקת משימה
  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("למחוק משימה זו?")) return;
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  // מסך התחברות
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#ffffff', borderRadius: '24px', padding: '36px 28px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
          
          <div style={{ width: '60px', height: '60px', backgroundColor: '#3b82f6', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '28px', marginBottom: '16px', boxShadow: '0 8px 16px rgba(59,130,246,0.3)' }}>
            ✓
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>כניסה לאפליקציה</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 28px 0' }}>הזן את שמך ובחר את סוג החשבון</p>

          <form onSubmit={handleLogin} style={{ textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
              שם מלא / שם משתמש
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="הזן שם מלא..."
              autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '15px', boxSizing: 'border-box', marginBottom: '20px' }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
              סוג הרשאה
            </label>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => setRoleInput('משתמש')}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: roleInput === 'משתמש' ? '#ffffff' : 'transparent', color: roleInput === 'משתמש' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'משתמש' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
              >
                משתמש
              </button>
              <button
                type="button"
                onClick={() => setRoleInput('מנהל')}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: roleInput === 'מנהל' ? '#ffffff' : 'transparent', color: roleInput === 'מנהל' ? '#2563eb' : '#64748b', fontWeight: '700', cursor: 'pointer', boxShadow: roleInput === 'מנהל' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
              >
                מנהל
              </button>
            </div>

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)', transition: 'all 0.2s' }}
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  // סינון משימות
  const filteredTasks = tasks.filter((t) => {
    const matchProject = selectedFilterProject === 'כל הפרויקטים' || t.project === selectedFilterProject;
    const matchSearch = searchTerm === '' || 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assignee.toLowerCase().includes(searchTerm.toLowerCase());
    return matchProject && matchSearch;
  });

  const allProjectNames = Array.from(new Set([...projects.map((p) => p.name), ...tasks.map((t) => t.project)]));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px 16px', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* סרגל עליון */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: '#f1f5f9', borderRadius: '10px' }}>
              <span style={{ fontWeight: '700', color: '#0f172a' }}>{currentUser}</span>
              <span style={{ fontSize: '12px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>{userRole}</span>
            </div>
            <button 
              onClick={handleLogout} 
              style={{ border: '1px solid #e2e8f0', background: '#ffffff', padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#ef4444', fontWeight: '600' }}
              title="התנתק"
            >
              יציאה
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>ניהול משימות ופרויקטים</h1>
              <span style={{ fontSize: '13px', color: '#64748b' }}>מעקב משימות ונושאים היררכי בזמן אמת</span>
            </div>
            <div style={{ width: '44px', height: '44px', backgroundColor: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '22px', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>
              ⚡
            </div>
          </div>

        </div>

        {/* סרגל כפתורי פעולה וחיפוש */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
          
          <select
            value={selectedFilterProject}
            onChange={(e) => setSelectedFilterProject(e.target.value)}
            style={{ padding: '11px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', fontWeight: '600', color: '#334155' }}
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
            style={{ flex: 1, minWidth: '200px', padding: '11px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none' }}
          />

          <button
            onClick={() => setShowAddProjectModal(true)}
            style={{ padding: '11px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}
          >
            📁 + פרויקט חדש
          </button>

          <button
            onClick={() => setShowAddTaskModal(true)}
            style={{ padding: '11px 20px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 10px rgba(37,99,235,0.25)' }}
          >
            + משימה חדשה
          </button>
        </div>

        {/* מודאל הוספת פרויקט */}
        {showAddProjectModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>הוספת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject}>
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="שם הפרויקט (למשל: אלתא, שדרוג מערכת...)"
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px', boxSizing: 'border-box', marginBottom: '20px' }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} style={{ padding: '12px 18px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל הוספת משימה */}
        {showAddTaskModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '520px', textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>פרויקט:</label>
                  <select
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff' }}
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
                    placeholder="למשל: תוכנה, חומרה, רכש..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תיאור המשימה:</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה צריך לבצע?"
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>אחראי:</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="שם האחראי..."
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>תאריך יעד:</label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} style={{ padding: '12px 18px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>
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
              <div key={projectName} style={{ marginBottom: '28px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                
                {/* כותרת הפרויקט */}
                <div style={{ backgroundColor: '#1e293b', color: '#ffffff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: '#2563eb', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>פרויקט</span>
                    <span style={{ fontSize: '17px', fontWeight: '700' }}>{projectName}</span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>({projectTasks.length} משימות)</span>
                  </div>

                  {projectDoc && (
                    <button
                      onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}
                      title="מחק פרויקט"
                    >
                      🗑️ מחק פרויקט
                    </button>
                  )}
                </div>

                {/* תוכן הטבלה */}
                {projectTasks.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    אין עדיין משימות בפרויקט זה.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right', minWidth: '950px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                          <th style={{ padding: '12px 16px', width: '120px' }}>נושא משותף</th>
                          <th style={{ padding: '12px 16px' }}>משימה (תיאור)</th>
                          <th style={{ padding: '12px 16px', width: '130px' }}>אחראי</th>
                          <th style={{ padding: '12px 14px', width: '100px' }}>פתיחה</th>
                          <th style={{ padding: '12px 14px', width: '110px' }}>יעד</th>
                          <th style={{ padding: '12px 14px', width: '110px' }}>השלמה</th>
                          <th style={{ padding: '12px 12px', width: '60px' }}>דחיות</th>
                          <th style={{ padding: '12px 12px', width: '70px' }}>איחור</th>
                          <th style={{ padding: '12px 16px', width: '110px' }}>סטטוס</th>
                          <th style={{ padding: '12px 16px', width: '260px' }}>הערות</th>
                          <th style={{ padding: '12px 10px', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.map((t) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s' }}>
                            
                            <td style={{ padding: '12px 16px', fontWeight: '700', color: '#2563eb' }}>
                              {t.topic}
                            </td>

                            <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: '500' }}>
                              {t.description}
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                👤 {t.assignee}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', color: '#64748b' }}>
                              {t.startDate}
                            </td>

                            <td style={{ padding: '12px 14px', color: '#0284c7', fontWeight: '600' }}>
                              📅 {t.dueDate}
                            </td>

                            <td style={{ padding: '12px 14px', color: t.completedDate ? '#16a34a' : '#94a3b8' }}>
                              {t.completedDate || '-'}
                            </td>

                            <td style={{ padding: '12px 12px', color: t.delays > 0 ? '#ea580c' : '#64748b', fontWeight: '700' }}>
                              {t.delays || '-'}
                            </td>

                            <td style={{ padding: '12px 12px', color: t.delayDays > 0 ? '#dc2626' : '#64748b', fontWeight: '700' }}>
                              {t.delayDays || '-'}
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <select
                                value={t.status}
                                onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '8px',
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

                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ maxHeight: '70px', overflowY: 'auto', marginBottom: '6px' }}>
                                {(t.notes || []).map((n, idx) => (
                                  <div key={idx} style={{ fontSize: '11px', backgroundColor: '#f8fafc', padding: '4px 8px', borderRadius: '6px', marginBottom: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: '700', color: '#1e293b' }}>{n.author}: </span>
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
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                                />
                                <button
                                  onClick={() => handleAddNote(t.id)}
                                  style={{ padding: '5px 10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                  שלח
                                </button>
                              </div>
                            </td>

                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleDeleteTask(t.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', opacity: 0.7 }}
                                title="מחק משימה"
                              >
                                ✕
                              </button>
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
