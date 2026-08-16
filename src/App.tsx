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

  // 1. חיבור אוטומטי כאורח (ללא מסך הרשמה)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        signInAnonymously(auth).catch((error) => {
          console.error("שגיאה בהתחברות אנונימית:", error);
        });
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. טעינת המשימות בזמן אמת עבור המשתמש הנוכחי
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

  // הוספת משימה חדשה
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim() || !user) return;

    await addDoc(collection(db, 'tasks'), {
      text: newTask,
      completed: false,
      userId: user.uid,
      createdAt: serverTimestamp()
    });

    setNewTask('');
  };

  // עדכון מצב משימה (הושלמה / לא הושלמה)
  const toggleTask = async (id: string, currentCompleted: boolean) => {
    const taskRef = doc(db, 'tasks', id);
    await updateDoc(taskRef, {
      completed: !currentCompleted
    });
  };

  // מחיקת משימה
  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, 'tasks', id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <h2>טוען את המשימות...</h2>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif', direction: 'rtl' }}>
      <h1>רשימת המשימות שלי 📝</h1>

      <form onSubmit={addTask} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="הוסף משימה חדשה..."
          style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', borderRadius: '5px', background: '#0070f3', color: '#fff', border: 'none' }}>
          הוסף
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tasks.map((task) => (
          <li
            key={task.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px',
              borderBottom: '1px solid #eee',
              textDecoration: task.completed ? 'line-through' : 'none',
              color: task.completed ? '#888' : '#000'
            }}
          >
            <span 
              onClick={() => toggleTask(task.id, task.completed)} 
              style={{ cursor: 'pointer', flex: 1 }}
            >
              {task.text}
            </span>
            <button
              onClick={() => deleteTask(task.id)}
              style={{ background: '#ff4d4f', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}
            >
              מחק
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
