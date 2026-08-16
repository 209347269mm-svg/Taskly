import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { Trash2, Plus, CheckCircle2, Circle, Loader2, FolderPlus, Folder } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  userId: string;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  projectId: string;
  userId: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const [newTaskText, setNewTaskText] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. חיבור אנונימי מהיר ברקע
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        signInAnonymously(auth).catch((err) => console.error("Anonymous Auth Error:", err));
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. טעינת פרויקטים
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedProjects: Project[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Project, 'id'>)
      }));

      setProjects(fetchedProjects);

      if (fetchedProjects.length > 0 && !activeProjectId) {
        setActiveProjectId(fetchedProjects[0].id);
      }
    });

    return () => unsubscribe();
  }, [user, activeProjectId]);

  // 3. טעינת משימות עבור הפרויקט הנבחר
  useEffect(() => {
    if (!user || !activeProjectId) {
      setTasks([]);
      return;
    }

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      where('projectId', '==', activeProjectId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks: Task[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Task, 'id'>)
      }));
      setTasks(fetchedTasks);
    });

    return () => unsubscribe();
  }, [user, activeProjectId]);

  // הוספת פרויקט
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;

    const docRef = await addDoc(collection(db, 'projects'), {
      name: newProjectName.trim(),
      userId: user.uid,
      createdAt: serverTimestamp()
    });

    setActiveProjectId(docRef.id);
    setNewProjectName('');
    setIsAddingProject(false);
  };

  // מחיקת פרויקט
  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("האם למחוק את הפרויקט וכל המשימות שבו?")) return;

    await deleteDoc(doc(db, 'projects', projectId));

    tasks.forEach(async (task) => {
      if (task.projectId === projectId) {
        await deleteDoc(doc(db, 'tasks', task.id));
      }
    });

    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length > 0) {
      setActiveProjectId(remaining[0].id);
    } else {
      setActiveProjectId('');
    }
  };

  // הוספת משימה
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim() || !user || !activeProjectId) return;

    await addDoc(collection(db, 'tasks'), {
      text: newTaskText.trim(),
      completed: false,
      projectId: activeProjectId,
      userId: user.uid,
      createdAt: serverTimestamp()
    });

    setNewTaskText('');
  };

  // שינוי מצב משימה
  const toggleTask = async (id: string, currentCompleted: boolean) => {
    await updateDoc(doc(db, 'tasks', id), {
      completed: !currentCompleted
    });
  };

  // מחיקת משימה
  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, 'tasks', id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <Loader2 className="animate-spin" size={32} color="#0070f3" />
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
      
      {/* כותרת ראשית */}
      <h1 style={{ textAlign: 'center', marginBottom: '20px', color: '#111', fontSize: '24px' }}>
        ניהול משימות ופרויקטים 📋
      </h1>

      {/* סרגל פרויקטים */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          overflowX: 'auto', 
          paddingBottom: '8px',
          scrollbarWidth: 'thin'
        }}>
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            return (
              <div
                key={proj.id}
                onClick={() => setActiveProjectId(proj.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  backgroundColor: isActive ? '#0070f3' : '#f1f5f9',
                  color: isActive ? '#fff' : '#334155',
                  fontWeight: isActive ? '600' : 'normal',
                  border: isActive ? '1px solid #0070f3' : '1px solid #e2e8f0',
                  transition: 'all 0.2s ease'
                }}
              >
                <Folder size={16} />
                <span>{proj.name}</span>
                {isActive && (
                  <Trash2 
                    size={14} 
                    onClick={(e) => handleDeleteProject(proj.id, e)} 
                    style={{ marginRight: '4px', opacity: 0.8, cursor: 'pointer' }} 
                  />
                )}
              </div>
            );
          })}

          {/* כפתור הוספת פרויקט */}
          <button
            onClick={() => setIsAddingProject(!isAddingProject)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              borderRadius: '20px',
              border: '1px dashed #94a3b8',
              backgroundColor: '#fff',
              color: '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '14px'
            }}
          >
            <FolderPlus size={16} />
            <span>פרויקט חדש</span>
          </button>
        </div>

        {/* טופס הוספת פרויקט חדש */}
        {isAddingProject && (
          <form onSubmit={handleAddProject} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="הזן שם פרויקט..."
              autoFocus
              style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
            />
            <button 
              type="submit" 
              style={{ padding: '8px 14px', borderRadius: '6px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              שמור
            </button>
            <button 
              type="button" 
              onClick={() => setIsAddingProject(false)} 
              style={{ padding: '8px 14px', borderRadius: '6px', background: '#e2e8f0', color: '#334155', border: 'none', cursor: 'pointer' }}
            >
              ביטול
            </button>
          </form>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />

      {/* אזור משימות לפרויקט הפעיל */}
      {activeProject ? (
        <div>
          <h2 style={{ fontSize: '18px', color: '#1e293b', marginBottom: '12px' }}>
            משימות עבור: <strong>{activeProject.name}</strong>
          </h2>

          <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="הזן משימה חדשה..."
              style={{ flex: 1, padding: '10px 14px', fontSize: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
            />
            <button 
              type="submit" 
              style={{ padding: '10px 16px', fontSize: '15px', cursor: 'pointer', borderRadius: '8px', background: '#0070f3', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              <Plus size={18} /> הוסף
            </button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tasks.length === 0 ? (
              <li style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>
                אין משימות עדיין בפרויקט זה.
              </li>
            ) : (
              tasks.map((task) => (
                <li
                  key={task.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div 
                    onClick={() => toggleTask(task.id, task.completed)} 
                    style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    {task.completed ? (
                      <CheckCircle2 size={20} color="#22c55e" />
                    ) : (
                      <Circle size={20} color="#94a3b8" />
                    )}
                    <span style={{ 
                      textDecoration: task.completed ? 'line-through' : 'none', 
                      color: task.completed ? '#94a3b8' : '#1e293b',
                      fontSize: '15px'
                    }}>
                      {task.text}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}>
          <p>אין כרגע פרויקט פתוח.</p>
          <p style={{ fontSize: '14px' }}>לחץ על <strong>"פרויקט חדש"</strong> למעלה כדי להתחיל.</p>
        </div>
      )}

    </div>
  );
}
