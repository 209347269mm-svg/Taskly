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

// ... (שאר ה-Interfaces נשארים ללא שינוי מהקוד הקודם)

export default function App() {
  // ... (אותו ה-State מהקוד הקודם)
  
  // התיקון הקריטי כאן: מוודאים שכל כפתור מפעיל את הסטייט בצורה ישירה
  const renderViewControls = () => (
    <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: '10px', padding: '3px', border: '1px solid #cbd5e1' }}>
      <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'table' ? '#2563eb' : 'transparent', color: viewMode === 'table' ? '#ffffff' : '#475569', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📊 טבלה</button>
      <button onClick={() => setViewMode('cards')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'cards' ? '#2563eb' : 'transparent', color: viewMode === 'cards' ? '#ffffff' : '#475569', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>🗂️ כרטיסיות</button>
      <button onClick={() => setViewMode('calendar')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'calendar' ? '#2563eb' : 'transparent', color: viewMode === 'calendar' ? '#ffffff' : '#475569', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📅 יומן</button>
      <button onClick={() => setViewMode('dashboard')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: viewMode === 'dashboard' ? '#2563eb' : 'transparent', color: viewMode === 'dashboard' ? '#ffffff' : '#475569', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>📊 דשבורד</button>
    </div>
  );

  // הוספת פרויקט - בלי בחירת צבע
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'מנהל') return;
    const trimmed = newProjectNameInput.trim();
    if (!trimmed) return;

    await addDoc(collection(db, 'projects_list'), {
      name: trimmed,
      color: '#2563eb', // צבע ברירת מחדל קבוע
      createdAt: serverTimestamp()
    });
    setNewProjectNameInput('');
    setShowAddProjectModal(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '24px 16px', direction: 'rtl', fontFamily: FONT_FAMILY }}>
       {/* ... תצוגת ה-Header והסרגלים עם קריאה ל-renderViewControls() ... */}
       {renderViewControls()}
       
       {/* מודאל הוספת פרויקט מתוקן (ללא בחירת צבע) */}
       {showAddProjectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: theme.cardBg, padding: '28px', borderRadius: '20px', width: '300px' }}>
             <h3>הוספת פרויקט</h3>
             <input 
               value={newProjectNameInput} 
               onChange={(e) => setNewProjectNameInput(e.target.value)} 
               placeholder="שם הפרויקט..."
               style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
             />
             <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCreateProject}>צור</button>
                <button onClick={() => setShowAddProjectModal(false)}>ביטול</button>
             </div>
          </div>
        </div>
       )}
    </div>
  );
}
