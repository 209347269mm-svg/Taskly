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
  orderBy,
  setDoc
} from 'firebase/firestore';

interface NoteItem { id: string; text: string; author: string; time: string; }
interface SubTask { id: string; text: string; completed: boolean; }
interface Task {
  id: string; project: string; topic: string; description: string; assignee: string;
  startDate: string; dueDate: string; completedDate?: string; delays: number;
  priority: 'נמוכה' | 'בינונית' | 'גבוהה'; isArchived: boolean; isDeleted: boolean;
  orderIndex?: number; status: 'פתוח' | 'בביצוע' | 'הושלם' | 'נדחה';
  notes: NoteItem[]; subtasks: SubTask[];
}
interface ProjectDoc { id: string; name: string; color?: string; }

const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#4f46e5'];
const FONT_FAMILY = "'Assistant', 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');
  const [nameInput, setNameInput] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [currentTab, setCurrentTab] = useState<'active' | 'archived' | 'trash'>('active');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  const [selectedProjectFilters, setSelectedProjectFilters] = useState<string[]>(['הכל']);
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>(['הכל']);
  const [selectedPriorityFilters, setSelectedPriorityFilters] = useState<string[]>(['הכל']);
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [noteInputs, setNoteInputs] = useState<{ [taskId: string]: string }>({});
  const [subTaskTextInputs, setSubTaskTextInputs] = useState<{ [taskId: string]: string }>({});
  const [activeSubTaskAddingId, setActiveSubTaskAddingId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{ taskId: string; noteId: string; text: string } | null>(null);

  useEffect(() => {
    onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth); });
    const q = query(collection(db, 'tasks'), orderBy('startDate', 'desc'));
    return onSnapshot(q, (snapshot) => setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task))));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'projects_list'), (snapshot) => setProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectDoc))));
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    localStorage.setItem('taskly_user', nameInput.trim());
    setCurrentUser(nameInput.trim());
  };

  const handleStatusChange = async (taskId: string, newStatus: any) => {
    const isCompleted = newStatus === 'הושלם';
    await updateDoc(doc(db, 'tasks', taskId), { 
        status: newStatus, 
        isArchived: isCompleted,
        completedDate: isCompleted ? new Date().toISOString().split('T')[0] : '' 
    });
  };

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    await updateDoc(doc(db, 'tasks', editingTask.id), { ...editingTask });
    setEditingTask(null);
  };

  const theme = { bg: isDarkMode ? '#090d16' : '#f8fafc', cardBg: isDarkMode ? '#111827' : '#ffffff', textMain: isDarkMode ? '#f9fafb' : '#0f172a', border: isDarkMode ? '#1f2937' : '#e2e8f0' };

  if (!currentUser) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
      <form onSubmit={handleLogin} style={{ background: theme.cardBg, padding: '30px', borderRadius: '20px', border: `1px solid ${theme.border}` }}>
        <h2>כניסה למערכת</h2>
        <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="שם משתמש..." style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
        <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px' }}>התחבר</button>
      </form>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '20px', direction: 'rtl', fontFamily: FONT_FAMILY }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h1>Taskly</h1>
          <button onClick={() => { setCurrentUser(null); localStorage.removeItem('taskly_user'); }}>יציאה</button>
        </header>

        {/* טאבים */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => setCurrentTab('active')}>משימות ({tasks.filter(t=>!t.isDeleted && !t.isArchived).length})</button>
            <button onClick={() => setCurrentTab('archived')}>ארכיון</button>
            <button onClick={() => setCurrentTab('trash')}>סל מחזור</button>
        </div>

        {/* טבלת משימות */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <th>נושא</th><th>תיאור ותת-משימות</th><th>עדיפות</th><th>סטטוס</th><th>הערות</th><th>פעולות</th>
                </tr>
            </thead>
            <tbody>
                {tasks.filter(t => {
                    const matchTab = currentTab === 'trash' ? t.isDeleted : currentTab === 'archived' ? (!t.isDeleted && t.isArchived) : (!t.isDeleted && !t.isArchived);
                    return matchTab;
                }).map(t => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td>{t.topic}</td>
                        <td>
                            {t.description}
                            <div style={{ marginTop: '5px' }}>
                                {(t.subtasks || []).map(sub => (
                                    <div key={sub.id} style={{ display: 'flex', gap: '5px' }}>
                                        <input type="checkbox" checked={sub.completed} onChange={async () => {
                                            const newSub = t.subtasks.map(s => s.id === sub.id ? {...s, completed: !s.completed} : s);
                                            await updateDoc(doc(db, 'tasks', t.id), { subtasks: newSub });
                                        }} />
                                        {sub.text}
                                        <button onClick={async () => await updateDoc(doc(db, 'tasks', t.id), { subtasks: t.subtasks.filter(s => s.id !== sub.id) })}>✕</button>
                                    </div>
                                ))}
                            </div>
                            {activeSubTaskAddingId === t.id ? (
                                <div style={{ marginTop: '5px' }}>
                                    <input type="text" placeholder="תת-משימה חדשה..." onChange={(e) => setSubTaskTextInputs({...subTaskTextInputs, [t.id]: e.target.value})} />
                                    <button onClick={async () => {
                                        await updateDoc(doc(db, 'tasks', t.id), { subtasks: [...(t.subtasks||[]), { id: Date.now().toString(), text: subTaskTextInputs[t.id], completed: false }] });
                                        setActiveSubTaskAddingId(null);
                                    }}>הוסף</button>
                                </div>
                            ) : <button onClick={() => setActiveSubTaskAddingId(t.id)}>+</button>}
                        </td>
                        <td>{t.priority}</td>
                        <td>
                            <select value={t.status} onChange={(e) => handleStatusChange(t.id, e.target.value as any)}>
                                <option value="פתוח">פתוח</option><option value="בביצוע">בביצוע</option><option value="הושלם">הושלם</option><option value="נדחה">נדחה</option>
                            </select>
                        </td>
                        <td>
                            {(t.notes || []).map(n => (
                                <div key={n.id} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    <span>{n.text}</span>
                                    <button onClick={() => setEditingNote({taskId: t.id, noteId: n.id, text: n.text})}>✏️</button>
                                    <button onClick={() => handleDeleteNote(t.id, n.id)}>🗑️</button>
                                </div>
                            ))}
                            <input type="text" value={noteInputs[t.id] || ''} onChange={(e) => setNoteInputs({...noteInputs, [t.id]: e.target.value})} />
                            <button onClick={() => handleAddNote(t.id)}>שלח</button>
                        </td>
                        <td>
                            {currentTab === 'archived' ? (
                                <>
                                    <button onClick={() => handleToggleArchive(t.id, t.isArchived)}>החזר</button>
                                    <button onClick={() => handleToggleTrash(t.id, t.isDeleted)}>מחק</button>
                                </>
                            ) : (
                                <button onClick={() => setEditingTask(t)}>ערוך משימה</button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>

        {/* מודאל עריכת משימה (כולל דחיות ותאריך) */}
        {editingTask && (
            <div style={{ position: 'fixed', top: '20%', right: '30%', background: theme.cardBg, padding: '20px', border: `1px solid ${theme.border}`, zIndex: 1000 }}>
                <h3>עריכת משימה</h3>
                <label>דחיות:</label>
                <input type="number" value={editingTask.delays} onChange={e => setEditingTask({...editingTask, delays: parseInt(e.target.value)})} />
                <br/>
                <label>תאריך השלמה:</label>
                <input type="date" value={editingTask.completedDate || ''} onChange={e => setEditingTask({...editingTask, completedDate: e.target.value})} />
                <br/>
                <button onClick={handleSaveEditedTask}>שמור</button>
                <button onClick={() => setEditingTask(null)}>ביטול</button>
            </div>
        )}
      </div>
    </div>
  );
}
