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

  // 1. חיבור אנונימי ברקע
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        signInAnonymously(auth)
          .then((res) => {
            setUser(res.user);
            setLoading(false);
          })
          .catch((err) => {
            console.error("Auth error:", err);
            setLoading(false);
          });
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
    }, (error) => {
      console.error("Projects error:", error);
    });

    return () => unsubscribe();
  }, [user, activeProjectId]);

  // 3. טעינת משימות
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
    }, (error) => {
      console.error("Tasks error:", error);
    });

    return () => unsubscribe();
  }, [user, activeProjectId]);

  // הוספת פרויקט
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;

    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        name: newProjectName.trim(),
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      setActiveProjectId(docRef.id);
      setNewProjectName('');
      setIsAddingProject(false);
    } catch (err) {
      console.error("Error adding project:", err);
    }
  };

  // מחיקת פרויקט
  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("האם למחוק את הפרויקט וכל המשימות שבו?")) return;

    try {
      await deleteDoc(doc(db, 'projects', projectId));

      tasks.forEach(async (task) => {
        if (task.projectId === projectId) {
          await deleteDoc(doc(db, 'tasks', task.id));
        }
      });

      const remaining = projects.filter((p) => p.id !== projectId);
      setActiveProjectId(remaining.length > 0 ? remaining[0].id : '');
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  };

  // הוספת משימה
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim() || !user || !activeProjectId) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        text: newTaskText.trim(),
        completed: false,
        projectId: activeProjectId,
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      setNewTaskText('');
    } catch (err) {
      console.error("Error adding task:", err);
    }
  };

  // שינוי סטטוס
  const toggleTask = async (id: string, currentCompleted: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', id), {
        completed: !currentCompleted
      });
    } catch (err) {
      console.error("Error toggling task:", err);
    }
  };

  // מחיקת משימה
  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#0070f3', fontSize: '18px', fontWeight: 'bold' }}>טוען אפליקציה...</p>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl', minHeight: '100vh' }}>
      
      {/* כותרת */}
      <h1 style={{ textAlign: 'center', marginBottom: '24px', color: '#0f172a', fontSize: '24px', fontWeight: '800' }}>
        ניהול משימות ופרויקטים 📋
      </h1>

      {/* סרגל גלילה לפרויקטים */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          overflowX: 'auto', 
          paddingBottom: '8px'
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
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  backgroundColor: isActive ? '#0070f3' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#334155',
                  fontWeight: isActive ? '700' : '500',
                  border: isActive ? '1px solid #0070f3' : '1px solid #e2e8f0',
                  boxShadow: isActive ? '0 2px 4px rgba(0,112,243,0.2)' : 'none'
                }}
              >
                <span>📁 {proj.name}</span>
                {isActive && (
                  <span 
                    onClick={(e) => handleDeleteProject(proj.id, e)} 
                    style={{ marginRight: '6px', cursor: 'pointer', opacity: 0.8, fontSize: '13px' }}
                    title="מחק פרויקט"
                  >
                    ✕
                  </span>
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
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px dashed #94a3b8',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            + פרויקט חדש
          </button>
        </div>

        {/* טופס פרויקט חדש */}
        {isAddingProject && (
          <form onSubmit={handleAddProject} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="שם הפרויקט החדש..."
              autoFocus
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '15px' }}
            />
            <button 
              type="submit" 
              style={{ padding: '10px 16px', borderRadius: '8px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              שמור
            </button>
            <button 
              type="button" 
              onClick={() => setIsAddingProject(false)} 
              style={{ padding: '10px 14px', borderRadius: '8px', background: '#e2e8f0', color: '#334155', border: 'none', cursor: 'pointer' }}
            >
              ביטול
            </button>
          </form>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />

      {/* משימות תחת הפרויקט */}
      {activeProject ? (
        <div>
          <h2 style={{ fontSize: '18px', color: '#1e293b', marginBottom: '14px' }}>
            משימות עבור: <strong>{activeProject.name}</strong>
          </h2>

          <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder={`הוסף משימה ל-${activeProject.name}...`}
              style={{ flex: 1, padding: '12px 14px', fontSize: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
            />
            <button 
              type="submit" 
              style={{ padding: '12px 18px', fontSize: '15px', cursor: 'pointer', borderRadius: '8px', background: '#0070f3', color: '#fff', border: 'none', fontWeight: 'bold' }}
            >
              + הוסף
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                אין משימות עדיין בפרויקט זה.
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div 
                    onClick={() => toggleTask(task.id, task.completed)} 
                    style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <span style={{ fontSize: '18px', color: task.completed ? '#22c55e' : '#94a3b8' }}>
                      {task.completed ? '✔' : '○'}
                    </span>
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
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '4px 8px' }}
                    title="מחק משימה"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>אין כרגע פרויקטים פעילים.</p>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>לחץ על <strong>"+ פרויקט חדש"</strong> למעלה כדי להתחיל!</p>
        </div>
      )}

    </div>
  );
}
