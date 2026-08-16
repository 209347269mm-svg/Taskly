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

  // סיסמת מנהל מהשרת
  const [adminPassword, setAdminPassword] = useState('1234');
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [selectedFilterProject, setSelectedFilterProject] = useState('כל הפרויקטים');
  const [searchTerm, setSearchTerm] = useState('');

  // מודאלים
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);

  // משימה חדשה
  const [newProject, setNewProject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // פרויקט חדש
  const [newProjectNameInput, setNewProjectNameInput] = useState('');

  // הערות
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});

  // 1. חיבור אנונימי ברקע ל-Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch((err) => console.error("Firebase auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. סנכרון סיסמת מנהל מ-Firestore בזמן אמת
  useEffect(() => {
    const docRef = doc(db, 'settings', 'admin_config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.adminPassword) {
          setAdminPassword(data.adminPassword);
        }
      } else {
        // יצירת סיסמת ברירת מחדל אם טרם הוגדרה
        setDoc(docRef, { adminPassword: '1234' }).catch((err) => console.error("Set default password error:", err));
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. טעינת פרויקטים
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

  // 4. טעינת משימות
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

    // בדיקת סיסמה אך ורק למנהל
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

  // עדכון סיסמת מנהל
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

  // מסך התחברות
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 font-sans text-slate-800" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl text-center">
          
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl mx-auto mb-6 shadow-lg shadow-blue-500/30">
            ✓
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-2">כניסה לאפליקציה</h2>
          <p className="text-sm text-slate-500 mb-6">הזן את שמך ובחר את סוג החשבון</p>

          {authError && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold text-right">
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="text-right space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                שם מלא / שם משתמש
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הזן שם..."
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                סוג הרשאה
              </label>
              <div className="flex bg-slate-100 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRoleInput('משתמש')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${roleInput === 'משתמש' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  משתמש (כניסה ישירה)
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('מנהל')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${roleInput === 'מנהל' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  מנהל (דרושה סיסמה)
                </button>
              </div>
            </div>

            {roleInput === 'מנהל' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  סיסמת מנהל
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="הזן סיסמת מנהל..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition-all"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-blue-600/30 transition-all mt-4"
            >
              התחבר למערכת
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased p-4 md:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header סרגל עליון */}
        <header className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800 text-sm">👤 {currentUser}</span>
              <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">{userRole}</span>
            </div>

            {userRole === 'מנהל' && (
              <button
                onClick={() => setShowPasswordChangeModal(true)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
              >
                🔑 שינוי סיסמת מנהל
              </button>
            )}

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-colors"
            >
              יציאה
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="text-left">
              <h1 className="text-xl md:text-2xl font-black text-slate-900">ניהול משימות לפי פרויקטים</h1>
              <p className="text-xs md:text-sm text-slate-500">מערכת מעקב משימות ונושאים היררכית (מחובר בזמן אמת)</p>
            </div>
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl shadow-md shadow-blue-500/20">
              ⚡
            </div>
          </div>

        </header>

        {/* סרגל חיפוש ופעולות */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedFilterProject}
            onChange={(e) => setSelectedFilterProject(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
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
            className="flex-1 min-w-[220px] px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 shadow-sm"
          />

          {userRole === 'מנהל' && (
            <button
              onClick={() => setShowAddProjectModal(true)}
              className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all shadow-sm"
            >
              📁 + פרויקט חדש
            </button>
          )}

          <button
            onClick={() => setShowAddTaskModal(true)}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md shadow-blue-600/20 transition-all"
          >
            + משימה חדשה
          </button>
        </div>

        {/* מודאל שינוי סיסמת מנהל */}
        {showPasswordChangeModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl text-right">
              <h3 className="text-lg font-bold text-slate-900 mb-2">שינוי סיסמת מנהל</h3>
              <p className="text-xs text-slate-500 mb-4">הסיסמה החדשה תישמר בענן עבור כל המנהלים</p>
              <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
                <input
                  type="text"
                  value={newAdminPasswordInput}
                  onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                  placeholder="הקלד סיסמה חדשה..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm">
                    שמור סיסמה
                  </button>
                  <button type="button" onClick={() => setShowPasswordChangeModal(false)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm">
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל פרויקט חדש */}
        {showAddProjectModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl text-right">
              <h3 className="text-lg font-bold text-slate-900 mb-4">יצירת פרויקט חדש</h3>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="שם הפרויקט..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm">
                    צור פרויקט
                  </button>
                  <button type="button" onClick={() => setShowAddProjectModal(false)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm">
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* מודאל משימה חדשה */}
        {showAddTaskModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl text-right">
              <h3 className="text-xl font-bold text-slate-900 mb-5">הוספת משימה חדשה</h3>
              <form onSubmit={handleCreateTask} className="space-y-4">
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">פרויקט</label>
                  <select
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none bg-white text-sm"
                  >
                    {allProjectNames.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">נושא / תת-נושא</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="למשל: תוכנה, חומרה, בדיקות..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">תיאור המשימה</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="מה נדרש לבצע?"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">אחראי</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="שם האחראי..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">תאריך יעד</label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <button type="submit" className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md">
                    שמור משימה
                  </button>
                  <button type="button" onClick={() => setShowAddTaskModal(false)} className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm">
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
              <div key={projectName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                
                {/* כותרת פרויקט */}
                <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded-md">פרויקט</span>
                    <h2 className="text-base md:text-lg font-bold">{projectName}</h2>
                    <span className="text-xs text-slate-400">({projectTasks.length} משימות)</span>
                  </div>

                  {projectDoc && userRole === 'מנהל' && (
                    <button
                      onClick={() => handleDeleteProject(projectDoc.id, projectDoc.name)}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      🗑️ מחק פרויקט
                    </button>
                  )}
                </div>

                {/* טבלה */}
                {projectTasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    אין עדיין משימות בפרויקט זה.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs md:text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                          <th className="py-3.5 px-4">נושא משותף</th>
                          <th className="py-3.5 px-4">משימה (תיאור)</th>
                          <th className="py-3.5 px-4">אחראים</th>
                          <th className="py-3.5 px-3">תאריך פתיחה</th>
                          <th className="py-3.5 px-3">תאריך יעד</th>
                          <th className="py-3.5 px-4">סטטוס</th>
                          <th className="py-3.5 px-4 min-w-[240px]">הערות</th>
                          <th className="py-3.5 px-3 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {projectTasks.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                            
                            <td className="py-3.5 px-4 font-bold text-blue-600">
                              {t.topic}
                            </td>

                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                              {t.description}
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                👤 {t.assignee}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-slate-500 text-xs">
                              {t.startDate}
                            </td>

                            <td className="py-3.5 px-3 text-slate-700 font-semibold text-xs">
                              📅 {t.dueDate}
                            </td>

                            <td className="py-3.5 px-4">
                              <select
                                value={t.status}
                                onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                                className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer ${
                                  t.status === 'הושלם' ? 'bg-green-100 text-green-800' :
                                  t.status === 'בביצוע' ? 'bg-amber-100 text-amber-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}
                              >
                                <option value="פתוח">פתוח</option>
                                <option value="בביצוע">בביצוע</option>
                                <option value="הושלם">הושלם</option>
                              </select>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="max-h-20 overflow-y-auto space-y-1 mb-2">
                                {(t.notes || []).map((n, idx) => (
                                  <div key={idx} className="text-xs bg-slate-50 border border-slate-200 rounded p-1.5">
                                    <span className="font-bold text-slate-700">{n.author}: </span>
                                    <span className="text-slate-600">{n.text}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={noteInputs[t.id] || ''}
                                  onChange={(e) => setNoteInputs({ ...noteInputs, [t.id]: e.target.value })}
                                  placeholder="הוסף הערה..."
                                  className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded text-xs outline-none focus:border-blue-500"
                                />
                                <button
                                  onClick={() => handleAddNote(t.id)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded transition-colors"
                                >
                                  שלח
                                </button>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-center">
                              {userRole === 'מנהל' && (
                                <button
                                  onClick={() => handleDeleteTask(t.id)}
                                  className="text-slate-400 hover:text-red-500 font-bold p-1 transition-colors"
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
