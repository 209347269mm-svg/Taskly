import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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

interface Note {
  id: string;
  user: string;
  project: string;
  topic: string;
  content: string;
  timestamp?: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  
  // שדות טופס
  const [userName, setUserName] = useState('');
  const [selectedProject, setSelectedProject] = useState('MBDA');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [content, setContent] = useState('');

  // פרויקטים ונושאים
  const [projectsList, setProjectsList] = useState<string[]>(['MBDA', 'אוקראינה']);
  const [projectTopicsMap, setProjectTopicsMap] = useState<{ [key: string]: string[] }>({
    'MBDA': ['ספרות'],
    'אוקראינה': ['תקלות']
  });

  const [newProjectInput, setNewProjectInput] = useState('');
  const [newTopicInput, setNewTopicInput] = useState('');
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);

  // 1. חיבור אנונימי שקט ברקע
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch((err) => console.error("Auth error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. טעינת רשימת הפתקים/הערות
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Note[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Note, 'id'>)
      }));
      setNotes(fetched);
    }, (err) => console.error("Notes read error:", err));

    return () => unsubscribe();
  }, [user]);

  // טעינת נושאים עבור הפרויקט הנבחר
  useEffect(() => {
    const topics = projectTopicsMap[selectedProject] || [];
    if (topics.length > 0) {
      setSelectedTopic(topics[0]);
    } else {
      setSelectedTopic('');
    }
  }, [selectedProject, projectTopicsMap]);

  // הוספת פרויקט חדש לרשימה
  const handleAddProject = () => {
    if (!newProjectInput.trim()) return;
    const name = newProjectInput.trim();
    if (!projectsList.includes(name)) {
      setProjectsList([...projectsList, name]);
      setProjectTopicsMap({ ...projectTopicsMap, [name]: [] });
      setSelectedProject(name);
    }
    setNewProjectInput('');
    setShowAddProject(false);
  };

  // הוספת נושא/תת-נושא לפרויקט הנוכחי
  const handleAddTopic = () => {
    if (!newTopicInput.trim() || !selectedProject) return;
    const topic = newTopicInput.trim();
    const currentTopics = projectTopicsMap[selectedProject] || [];
    if (!currentTopics.includes(topic)) {
      const updated = { ...projectTopicsMap, [selectedProject]: [...currentTopics, topic] };
      setProjectTopicsMap(updated);
      setSelectedTopic(topic);
    }
    setNewTopicInput('');
    setShowAddTopic(false);
  };

  // שליחת הערה / משימה
  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !userName.trim()) {
      alert('נא למלא שם ותוכן.');
      return;
    }

    try {
      await addDoc(collection(db, 'notes'), {
        user: userName.trim(),
        project: selectedProject,
        topic: selectedTopic || 'כללי',
        content: content.trim(),
        createdAt: serverTimestamp()
      });
      setContent('');
    } catch (err) {
      console.error("Error adding note:", err);
    }
  };

  // מחיקת הערה
  const handleDeleteNote = async (id: string) => {
    if (!window.confirm("למחוק הערה זו?")) return;
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (err) {
      console.error("Error deleting note:", err);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto', padding: '20px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl' }}>
      
      {/* טופס הוספה */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        
        {/* שם משתמש (נקי ללא דוגמה) */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', color: '#334155' }}>
            שם מלא / משתמש:
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="הזן את שמך..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* בחירת פרויקט */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontWeight: '600', color: '#334155' }}>פרויקט:</label>
            <button
              type="button"
              onClick={() => setShowAddProject(!showAddProject)}
              style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
            >
              {showAddProject ? 'סגור' : '+ פרויקט חדש'}
            </button>
          </div>

          {showAddProject ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={newProjectInput}
                onChange={(e) => setNewProjectInput(e.target.value)}
                placeholder="שם פרויקט חדש..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              />
              <button
                type="button"
                onClick={handleAddProject}
                style={{ padding: '8px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                הוסף
              </button>
            </div>
          ) : (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' }}
            >
              {projectsList.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>

        {/* בחירת נושא */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontWeight: '600', color: '#334155' }}>נושא / תת-נושא:</label>
            <button
              type="button"
              onClick={() => setShowAddTopic(!showAddTopic)}
              style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
            >
              {showAddTopic ? 'סגור' : '+ נושא חדש'}
            </button>
          </div>

          {showAddTopic ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={newTopicInput}
                onChange={(e) => setNewTopicInput(e.target.value)}
                placeholder="שם נושא חדש..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              />
              <button
                type="button"
                onClick={handleAddTopic}
                style={{ padding: '8px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                הוסף
              </button>
            </div>
          ) : (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' }}
            >
              {(projectTopicsMap[selectedProject] || []).length > 0 ? (
                projectTopicsMap[selectedProject].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))
              ) : (
                <option value="">ללא נושאים (הוסף חדש)</option>
              )}
            </select>
          )}
        </div>

        {/* תוכן ההערה */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', color: '#334155' }}>
            הערות:
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="כתוב כאן הערה או משימה..."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <button
          onClick={handleSubmitNote}
          style={{ width: '100%', padding: '12px', background: '#0070f3', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}
        >
          הוסף הערה
        </button>
      </div>

      {/* רשימת ההערות שהוזנו */}
      <h2 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '12px' }}>
        הערות ומשימות שנרשמו:
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notes.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>
            עדיין לא נרשמו הערות.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '14px 16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontWeight: '700', color: '#0f172a', marginLeft: '8px' }}>{note.user}</span>
                  <span style={{ fontSize: '12px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>
                    {note.project}
                  </span>
                  <span style={{ fontSize: '12px', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px' }}>
                    {note.topic}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                >
                  🗑️
                </button>
              </div>

              <div style={{ color: '#334155', fontSize: '15px', whiteSpace: 'pre-wrap' }}>
                {note.content}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
