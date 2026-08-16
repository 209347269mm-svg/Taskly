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

interface Task {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);

  // חיבור אוטומטי כאורח ברגע שהעמוד עולה
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
            console.error("Anonymous Auth Error:", err);
            setLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  // טעינת משימות בזמן אמת מ-Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks: Task[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Task, 'id'>)
      }));
      setTasks(fetchedTasks);
    });

    return () => unsubscribe();
  }, [user]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim() || !user) return;

    await addDoc(collection(db, 'tasks'), {
      text: newTask.trim(),
      completed: false,
      userId: user.uid,
      createdAt: serverTimestamp()
    });

    setNewTask('');
  };

  const toggleTask = async (id: string, currentCompleted: boolean) => {
    const taskRef = doc(db, 'tasks', id);
    await updateDoc(taskRef, {
      completed: !currentCompleted
    });
  };

  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, 'tasks', id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#0070f3', fontSize: '18px' }}>טוען...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '40px auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '24px', color: '#111', fontSize: '24px' }}>ניהול משימות 📝</h1>

      <form onSubmit={addTask} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="מה צריך לעשות היום?"
          style={{ flex: 1, padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none' }}
        />
        <button 
          type="submit" 
          style={{ padding: '12px 20px', fontSize: '16px', cursor: 'pointer', borderRadius: '8px', background: '#0070f3', color: '#fff', border: 'none', fontWeight: 'bold' }}
        >
          + הוסף
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {tasks.map((task) => (
          <li
            key={task.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              marginBottom: '8px',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #eee'
            }}
          >
            <div 
              onClick={() => toggleTask(task.id, task.completed)} 
              style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <span style={{ fontSize: '18px', color: task.completed ? '#22c55e' : '#9ca3af' }}>
                {task.completed ? '✔' : '○'}
              </span>
              <span style={{ textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? '#888' : '#000', fontSize: '16px' }}>
                {task.text}
              </span>
            </div>
            <button
              onClick={() => deleteTask(task.id)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
              title="מחק"
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
