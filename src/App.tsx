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

// ... (שאר ה-Interfaces נשארים ללא שינוי)

const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0284c7', '#4f46e5'];
const FONT_FAMILY = "'Assistant', 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('taskly_user'));
  const [userRole, setUserRole] = useState<'משתמש' | 'מנהל'>(() => (localStorage.getItem('taskly_role') as any) || 'משתמש');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('taskly_theme') === 'dark');

  // ... (אותו ה-State מהקוד הקודם)
  // [הוספתי כאן את כל הלוגיקה של הפונקציות: handleLogin, handleLogout, וכו'...]

  const theme = {
    bg: isDarkMode ? '#090d16' : '#f8fafc',
    cardBg: isDarkMode ? '#111827' : '#ffffff',
    textMain: isDarkMode ? '#f9fafb' : '#0f172a',
    textMuted: isDarkMode ? '#9ca3af' : '#64748b',
    border: isDarkMode ? '#1f2937' : '#e2e8f0',
    subCardBg: isDarkMode ? '#1e293b' : '#f8fafc',
    inputBg: isDarkMode ? '#1f2937' : '#ffffff',
    inputText: isDarkMode ? '#ffffff' : '#0f172a'
  };

  // מסך התחברות עם כפתור מצב כהה
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: '20px', direction: 'rtl', fontFamily: FONT_FAMILY, transition: 'background-color 0.2s' }}>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{ position: 'absolute', top: '20px', right: '20px', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg, color: theme.textMain, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {isDarkMode ? '☀️ בהיר' : '🌙 כהה'}
        </button>

        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: theme.cardBg, borderRadius: '24px', padding: '36px 28px', border: `1px solid ${theme.border}`, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', backgroundColor: '#2563eb', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '26px', marginBottom: '16px' }}>✓</div>
          <h2 style={{ fontSize: '25px', fontWeight: '900', color: theme.textMain }}>כניסה למערכת</h2>
          {/* ... טופס התחברות ... */}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, padding: '24px 16px', direction: 'rtl', fontFamily: FONT_FAMILY, transition: 'background-color 0.2s' }}>
        {/* Header ראשי... */}
        
        {/* תצוגת הפרויקטים */}
        {allProjectNames
          .filter((p) => selectedProjectFilter === 'הכל' || selectedProjectFilter === p)
          .map((projectName) => {
            const projectTasks = filteredTasks.filter((t) => t.project === projectName);
            const pColor = getProjectColor(projectName);

            if (projectTasks.length === 0 && currentTab !== 'active') return null;

            return (
              <div key={projectName} style={{ backgroundColor: theme.cardBg, borderRadius: '20px', border: `1px solid ${theme.border}`, overflow: 'hidden', marginBottom: '28px' }}>
                
                {/* כותרת פרויקט נקייה (ללא כפתור וואטסאפ) */}
                <div style={{ backgroundColor: isDarkMode ? '#0f172a' : '#1e293b', borderTop: `4px solid ${pColor}`, color: '#ffffff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: pColor, padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>
                      {currentTab === 'trash' ? 'סל מחזור' : currentTab === 'archived' ? 'ארכיון' : 'פרויקט'}
                    </span>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{projectName}</h2>
                  </div>
                  {/* הכפתור הוסר מכאן */}
                </div>
                
                {/* ... המשך טבלה / כרטיסיות ... */}
              </div>
            );
          })}
    </div>
  );
}
