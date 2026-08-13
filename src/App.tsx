import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Trash2,
  Sparkles,
  LayoutGrid,
  Table,
  Calendar,
  Tag,
  Edit3,
  X,
  Check,
  Clock,
  UserCheck,
  Lock,
  LogOut,
} from "lucide-react";

// ייבוא בסיס הנתונים ופונקציות ה-Firestore
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";

type TaskStatus = "פתוח" | "בטיפול" | "בבדיקה" | "הושלם";
type UserRole = "מנהל" | "משתמש";

// 🔐 הסיסמה / הקוד הסודי לגישת מנהל
const ADMIN_PASSCODE = "1234";

interface Note {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

interface Task {
  id: string;
  project: string;
  topic: string;
  description: string;
  assignee: string;
  createdAt: string;
  dueDate: string;
  completedDate?: string;
  postponeCount: number;
  status: TaskStatus;
  notes: Note[];
}

export default function App() {
  // ניהול זהות והתחברות
  const [currentUser, setCurrentUser] = useState<string>(
    () => localStorage.getItem("app_user_name") || ""
  );
  const [role, setRole] = useState<UserRole>(
    () => (localStorage.getItem("app_user_role") as UserRole) || "משתמש"
  );
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(
    () => !!localStorage.getItem("app_user_name")
  );

  // טופס התחברות
  const [loginNameInput, setLoginNameInput] = useState("");
  const [loginRoleInput, setLoginRoleInput] = useState<UserRole>("משתמש");
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectTopicsMap, setProjectTopicsMap] = useState<{
    [project: string]: string[];
  }>({});

  // סינונים
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("הכל");

  // מודאלים
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // עריכת שם פרויקט
  const [editingProjectName, setEditingProjectName] = useState<string | null>(
    null
  );
  const [newProjectNameInput, setNewProjectNameInput] = useState("");

  // ניהול הערות
  const [newNoteText, setNewNoteText] = useState<{ [key: string]: string }>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  // טופס משימה / נושא חדש
  const [newTask, setNewTask] = useState({
    project: "",
    topic: "",
    description: "",
    assignee: "",
    dueDate: "",
  });

  // 🔄 סנכרון בזמן אמת מול Firestore - משימות
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tasks"), (snapshot) => {
      const loadedTasks: Task[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Task[];
      setTasks(loadedTasks);
    });

    return () => unsubscribe();
  }, []);

  // 🔄 סנכרון בזמן אמת מול Firestore - מפת נושאים לפי פרויקט
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "settings"), (snapshot) => {
      const mapDoc = snapshot.docs.find((d) => d.id === "projectTopicsMap");
      if (mapDoc) {
        setProjectTopicsMap(mapDoc.data().map || {});
      }
    });

    return () => unsubscribe();
  }, []);

  // 🔑 טיפול בהתחברות
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    const name = loginNameInput.trim();
    if (!name) {
      setLoginError("נא להזין שם משתמש");
      return;
    }

    if (loginRoleInput === "מנהל") {
      if (adminCodeInput !== ADMIN_PASSCODE) {
        setLoginError("קוד מנהל שגוי!");
        return;
      }
    }

    // שמירה ב-State ובזיכרון הדפדפן
    setCurrentUser(name);
    setRole(loginRoleInput);
    setIsLoggedIn(true);

    localStorage.setItem("app_user_name", name);
    localStorage.setItem("app_user_role", loginRoleInput);
  };

  // 🚪 התנתקות
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser("");
    setRole("משתמש");
    setLoginNameInput("");
    setAdminCodeInput("");
    localStorage.removeItem("app_user_name");
    localStorage.removeItem("app_user_role");
  };

  // פונקציית עזר לעדכון ה-Topics Map ב-Firestore
  const saveProjectTopicsMap = async (newMap: { [key: string]: string[] }) => {
    await setDoc(doc(db, "settings", "projectTopicsMap"), { map: newMap });
  };

  const projectsList = Array.from(
    new Set([...tasks.map((t) => t.project), ...Object.keys(projectTopicsMap)])
  ).filter(Boolean);

  const getTopicsForProject = (proj: string) => {
    if (!proj) return [];
    const fromMap = projectTopicsMap[proj] || [];
    const fromTasks = tasks
      .filter((t) => t.project === proj)
      .map((t) => t.topic);
    return Array.from(new Set([...fromMap, ...fromTasks]));
  };

  const handleRenameProject = async (oldName: string) => {
    const trimmed = newProjectNameInput.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingProjectName(null);
      return;
    }

    const projectTasksToUpdate = tasks.filter((t) => t.project === oldName);
    for (const t of projectTasksToUpdate) {
      await updateDoc(doc(db, "tasks", t.id), { project: trimmed });
    }

    const updatedMap = { ...projectTopicsMap };
    if (updatedMap[oldName]) {
      updatedMap[trimmed] = updatedMap[oldName];
      delete updatedMap[oldName];
      await saveProjectTopicsMap(updatedMap);
    }

    if (selectedProject === oldName) {
      setSelectedProject(trimmed);
    }

    setEditingProjectName(null);
    setNewProjectNameInput("");
  };

  const handleDeleteProject = async (projectName: string) => {
    if (role !== "מנהל") return;
    if (
      confirm(
        `האם אתה בטוח שברצונך למחוק את הפרויקט "${projectName}" וכל המשימות המשויכות אליו?`
      )
    ) {
      const projectTasksToDelete = tasks.filter(
        (t) => t.project === projectName
      );
      for (const t of projectTasksToDelete) {
        await deleteDoc(doc(db, "tasks", t.id));
      }

      const updatedMap = { ...projectTopicsMap };
      delete updatedMap[projectName];
      await saveProjectTopicsMap(updatedMap);

      if (selectedProject === projectName) {
        setSelectedProject("הכל");
      }
    }
  };

  const calculateLateDays = (task: Task) => {
    if (task.status === "הושלם") return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newTask.project ||
      !newTask.topic ||
      !newTask.description ||
      !newTask.dueDate
    )
      return;

    const todayStr = new Date().toISOString().split("T")[0];

    const taskData = {
      project: newTask.project.trim(),
      topic: newTask.topic.trim(),
      description: newTask.description,
      assignee: newTask.assignee || currentUser,
      createdAt: todayStr,
      dueDate: newTask.dueDate,
      completedDate: "",
      postponeCount: 0,
      status: "פתוח" as TaskStatus,
      notes: [],
    };

    await addDoc(collection(db, "tasks"), taskData);

    const projName = newTask.project.trim();
    const currentTopics = projectTopicsMap[projName] || [];
    const updatedTopics = Array.from(
      new Set([...currentTopics, newTask.topic.trim()])
    );
    await saveProjectTopicsMap({
      ...projectTopicsMap,
      [projName]: updatedTopics,
    });

    setNewTask({
      project: "",
      topic: "",
      description: "",
      assignee: "",
      dueDate: "",
    });
    setShowNewTaskModal(false);
  };

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    const { id, ...taskData } = editingTask;
    await updateDoc(doc(db, "tasks", id), taskData);
    setEditingTask(null);
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const todayStr = new Date().toISOString().split("T")[0];
    await updateDoc(doc(db, "tasks", taskId), {
      status: newStatus,
      completedDate: newStatus === "הושלם" ? todayStr : "",
    });
  };

  const handlePostpone = async (taskId: string) => {
    const newDueDate = prompt("הכנס תאריך יעד חדש (YYYY-MM-DD):");
    if (!newDueDate) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    await updateDoc(doc(db, "tasks", taskId), {
      dueDate: newDueDate,
      postponeCount: (task.postponeCount || 0) + 1,
    });
  };

  const handleAddNote = async (taskId: string) => {
    const text = newNoteText[taskId];
    if (!text || !text.trim()) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const formattedDateTime = `${now.toLocaleDateString(
      "he-IL"
    )}, ${now.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    const newNote: Note = {
      id: Date.now().toString(),
      author: currentUser,
      content: text.trim(),
      createdAt: formattedDateTime,
    };

    await updateDoc(doc(db, "tasks", taskId), {
      notes: [newNote, ...(task.notes || [])],
    });

    setNewNoteText({ ...newNoteText, [taskId]: "" });
  };

  const handleSaveNoteEdit = async (taskId: string, noteId: string) => {
    if (!editingNoteText.trim()) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedNotes = task.notes.map((n) =>
      n.id === noteId ? { ...n, content: editingNoteText.trim() } : n
    );

    await updateDoc(doc(db, "tasks", taskId), {
      notes: updatedNotes,
    });

    setEditingNoteId(null);
    setEditingNoteText("");
  };

  const handleDeleteNote = async (taskId: string, noteId: string) => {
    if (confirm("למחוק הערה זו?")) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const updatedNotes = task.notes.filter((n) => n.id !== noteId);
      await updateDoc(doc(db, "tasks", taskId), {
        notes: updatedNotes,
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (role !== "מנהל") return;
    if (confirm("מחק משימה זו?")) {
      await deleteDoc(doc(db, "tasks", taskId));
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.assignee.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.topic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject =
      selectedProject === "הכל" || t.project === selectedProject;
    return matchesSearch && matchesProject;
  });

  const displayProjects =
    selectedProject === "הכל"
      ? projectsList
      : projectsList.filter((p) => p === selectedProject);

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "פתוח":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "בטיפול":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "בבדיקה":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "הושלם":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
  };

  // 🔒 מסך התחברות (אם המשתמש לא מחובר)
  if (!isLoggedIn) {
    return (
      <div
        className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans"
        dir="rtl"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <div className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold mx-auto shadow-md">
              <UserCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              כניסה לאפליקציה
            </h1>
            <p className="text-slate-500 text-xs">
              הזן את שמך ובחר את סוג החשבון להתחברות
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                שם מלא / שם משתמש
              </label>
              <input
                type="text"
                required
                placeholder="לדוגמה: משה גבעון"
                value={loginNameInput}
                onChange={(e) => setLoginNameInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                סוג הרשאה
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setLoginRoleInput("משתמש")}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    loginRoleInput === "משתמש"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  משתמש
                </button>
                <button
                  type="button"
                  onClick={() => setLoginRoleInput("מנהל")}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    loginRoleInput === "מנהל"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  מנהל
                </button>
              </div>
            </div>

            {loginRoleInput === "מנהל" && (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-1">
                <label className="block text-xs font-bold text-amber-900 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  קוד גישה למנהל
                </label>
                <input
                  type="password"
                  placeholder="הזן קוד מנהל (ברירת מחדל: 1234)"
                  value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs focus:outline-none"
                />
              </div>
            )}

            {loginError && (
              <div className="text-red-600 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-200 text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all"
            >
              התחבר למערכת
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 💻 האפליקציה הראשית
  return (
    <div
      className="min-h-screen bg-slate-100 text-slate-800 font-sans p-4 md:p-6"
      dir="rtl"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="max-w-[1750px] mx-auto space-y-5">
        {/* כותרת עליונה */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                ניהול משימות לפי פרויקטים
              </h1>
              <p className="text-slate-500 text-xs">
                מערכת מעקב משימות ונושאים היררכית (מחובר בזמן אמת)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  viewMode === "table"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                <Table className="w-3.5 h-3.5 inline ml-1" /> טבלה מקובצת
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  viewMode === "board"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 inline ml-1" /> לוח
              </button>
            </div>

            {/* תצוגת משתמש מחובר + התנתקות */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700">
                👤 {currentUser}
              </span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  role === "מנהל"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {role}
              </span>
              <button
                onClick={handleLogout}
                className="p-1 text-slate-400 hover:text-red-600 mr-1"
                title="התנתק"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* סרגל סינון */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 justify-between items-center">
          <div className="flex flex-wrap flex-1 gap-3 w-full md:w-auto">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3.5 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="חיפוש משימה / אחראי / נושא..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="הכל">כל הפרויקטים</option>
              {projectsList.map((p) => (
                <option key={p} value={p}>
                  פרויקט: {p}
                </option>
              ))}
            </select>
          </div>

          {role === "מנהל" && (
            <button
              onClick={() => {
                setNewTask({
                  project: selectedProject !== "הכל" ? selectedProject : "",
                  topic: "",
                  description: "",
                  assignee: "",
                  dueDate: "",
                });
                setShowNewTaskModal(true);
              }}
              className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> הוסף נושא / משימה חדשה
            </button>
          )}
        </div>

        {/* 📊 תצוגת טבלה מקובצת לפי פרויקטים */}
        {viewMode === "table" ? (
          <div className="space-y-6">
            {displayProjects.map((projectName) => {
              const projTasks = filteredTasks.filter(
                (t) => t.project === projectName
              );

              return (
                <div
                  key={projectName}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                >
                  <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-500 text-white text-xs font-black px-2.5 py-1 rounded-lg">
                        פרויקט
                      </span>

                      {editingProjectName === projectName ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newProjectNameInput}
                            onChange={(e) =>
                              setNewProjectNameInput(e.target.value)
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              handleRenameProject(projectName)
                            }
                            className="px-2 py-1 text-slate-900 rounded text-xs font-bold focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameProject(projectName)}
                            className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingProjectName(null)}
                            className="p-1 bg-slate-600 text-white rounded hover:bg-slate-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold">{projectName}</h2>
                          {role === "מנהל" && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingProjectName(projectName);
                                  setNewProjectNameInput(projectName);
                                }}
                                className="p-1 text-slate-400 hover:text-white"
                                title="ערוך שם פרויקט"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProject(projectName)}
                                className="p-1 text-slate-400 hover:text-red-400"
                                title="מחק פרויקט זה"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <span className="text-slate-400 text-xs">
                        ({projTasks.length} משימות)
                      </span>
                    </div>
                  </div>

                  {projTasks.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs border-collapse min-w-[1400px]">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 border-l border-slate-200">
                              נושא משותף
                            </th>
                            <th className="p-3 border-l border-slate-200 min-w-[200px]">
                              משימה (תיאור)
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              אחראים
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              תאריך פתיחה
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              תאריך יעד
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              השלמה בפועל
                            </th>
                            <th className="p-3 border-l border-slate-200 text-center">
                              דחיות
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              ימי איחור
                            </th>
                            <th className="p-3 border-l border-slate-200">
                              סטטוס
                            </th>
                            <th className="p-3 min-w-[280px]">
                              הערות (כולל תאריך ושעה)
                            </th>
                            {role === "מנהל" && (
                              <th className="p-3 text-center">פעולות</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {projTasks.map((t) => {
                            const lateDays = calculateLateDays(t);
                            return (
                              <tr
                                key={t.id}
                                className="hover:bg-slate-50 transition-all"
                              >
                                <td className="p-3 border-l border-slate-200 font-bold text-indigo-700 whitespace-nowrap bg-indigo-50/20">
                                  <span className="inline-flex items-center gap-1">
                                    <Tag className="w-3 h-3 text-indigo-500" />
                                    {t.topic}
                                  </span>
                                </td>
                                <td className="p-3 border-l border-slate-200 text-slate-800 font-medium leading-relaxed">
                                  {t.description}
                                </td>

                                <td className="p-3 border-l border-slate-200 whitespace-nowrap">
                                  <div className="space-y-1">
                                    {(t.assignee || "").split("\n").map(
                                      (person, idx) =>
                                        person.trim() && (
                                          <div
                                            key={idx}
                                            className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700 border border-slate-200"
                                          >
                                            👤 {person.trim()}
                                          </div>
                                        )
                                    )}
                                  </div>
                                </td>

                                <td className="p-3 border-l border-slate-200 text-slate-500 whitespace-nowrap">
                                  {t.createdAt}
                                </td>
                                <td className="p-3 border-l border-slate-200 text-slate-800 whitespace-nowrap font-medium">
                                  <div className="flex items-center justify-between gap-1">
                                    <span>{t.dueDate}</span>
                                    <button
                                      onClick={() => handlePostpone(t.id)}
                                      title="דחה תאריך יעד"
                                      className="text-slate-400 hover:text-amber-600 p-0.5"
                                    >
                                      <Calendar className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 border-l border-slate-200 text-emerald-700 font-semibold whitespace-nowrap">
                                  {t.completedDate || "-"}
                                </td>
                                <td className="p-3 border-l border-slate-200 text-center font-bold text-amber-600">
                                  {t.postponeCount || 0}
                                </td>
                                <td className="p-3 border-l border-slate-200 font-bold whitespace-nowrap">
                                  {lateDays > 0 ? (
                                    <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                      {lateDays} ימי איחור
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="p-3 border-l border-slate-200">
                                  <select
                                    value={t.status}
                                    onChange={(e) =>
                                      handleStatusChange(
                                        t.id,
                                        e.target.value as TaskStatus
                                      )
                                    }
                                    className={`px-2 py-1 rounded border text-xs font-bold cursor-pointer focus:outline-none ${getStatusBadge(
                                      t.status
                                    )}`}
                                  >
                                    <option value="פתוח">פתוח</option>
                                    <option value="בטיפול">בטיפול</option>
                                    <option value="בבדיקה">בבדיקה</option>
                                    <option value="הושלם">הושלם</option>
                                  </select>
                                </td>

                                <td className="p-3 border-l border-slate-200">
                                  <div className="space-y-2">
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        placeholder="הוסף הערה..."
                                        value={newNoteText[t.id] || ""}
                                        onChange={(e) =>
                                          setNewNoteText({
                                            ...newNoteText,
                                            [t.id]: e.target.value,
                                          })
                                        }
                                        onKeyDown={(e) =>
                                          e.key === "Enter" &&
                                          handleAddNote(t.id)
                                        }
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                                      />
                                      <button
                                        onClick={() => handleAddNote(t.id)}
                                        className="px-2 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded text-xs font-bold whitespace-nowrap"
                                      >
                                        שלח
                                      </button>
                                    </div>

                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {(t.notes || []).map((n) => (
                                        <div
                                          key={n.id}
                                          className="text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1"
                                        >
                                          {editingNoteId === n.id ? (
                                            <div className="flex items-center gap-1">
                                              <input
                                                type="text"
                                                value={editingNoteText}
                                                onChange={(e) =>
                                                  setEditingNoteText(
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full px-2 py-0.5 border border-blue-400 rounded text-xs focus:outline-none"
                                                autoFocus
                                              />
                                              <button
                                                onClick={() =>
                                                  handleSaveNoteEdit(t.id, n.id)
                                                }
                                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                                title="שמור"
                                              >
                                                <Check className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={() =>
                                                  setEditingNoteId(null)
                                                }
                                                className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400"
                                                title="ביטול"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ) : (
                                            <div>
                                              <div className="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                                                <span className="font-bold text-slate-700">
                                                  {n.author}
                                                </span>
                                                <span className="flex items-center gap-0.5 dir-ltr">
                                                  <Clock className="w-2.5 h-2.5 inline" />{" "}
                                                  {n.createdAt}
                                                </span>
                                              </div>
                                              <div className="flex justify-between items-start gap-1">
                                                <span className="text-slate-800 leading-snug flex-1">
                                                  {n.content}
                                                </span>
                                                <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                                                  <button
                                                    onClick={() => {
                                                      setEditingNoteId(n.id);
                                                      setEditingNoteText(
                                                        n.content
                                                      );
                                                    }}
                                                    className="p-0.5 text-slate-500 hover:text-blue-600"
                                                    title="ערוך הערה"
                                                  >
                                                    <Edit3 className="w-3 h-3" />
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteNote(
                                                        t.id,
                                                        n.id
                                                      )
                                                    }
                                                    className="p-0.5 text-slate-400 hover:text-red-600"
                                                    title="מחק הערה"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>

                                {role === "מנהל" && (
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => setEditingTask(t)}
                                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                        title="ערוך פרטי משימה"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteTask(t.id)}
                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                        title="מחק משימה"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      אין עדיין משימות בפרויקט זה.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* תצוגת לוח */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(["פתוח", "בטיפול", "בבדיקה", "הושלם"] as TaskStatus[]).map(
              (status) => {
                const colTasks = filteredTasks.filter(
                  (t) => t.status === status
                );
                return (
                  <div
                    key={status}
                    className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3"
                  >
                    <div className="flex justify-between items-center font-bold text-xs pb-2 border-b border-slate-200">
                      <span>{status}</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex gap-1 flex-wrap">
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                {t.project}
                              </span>
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                {t.topic}
                              </span>
                            </div>
                            {role === "מנהל" && (
                              <button
                                onClick={() => setEditingTask(t)}
                                className="text-slate-400 hover:text-blue-600"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-800">
                            {t.description}
                          </p>

                          <div className="space-y-1 pt-1 border-t border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400">
                              אחראים:
                            </span>
                            {(t.assignee || "").split("\n").map(
                              (p, i) =>
                                p.trim() && (
                                  <div
                                    key={i}
                                    className="text-[11px] font-medium text-slate-700"
                                  >
                                    👤 {p.trim()}
                                  </div>
                                )
                            )}
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-slate-200">
                            <div className="flex gap-1">
                              <input
                                type="text"
                                placeholder="הוסף הערה..."
                                value={newNoteText[t.id] || ""}
                                onChange={(e) =>
                                  setNewNoteText({
                                    ...newNoteText,
                                    [t.id]: e.target.value,
                                  })
                                }
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleAddNote(t.id)
                                }
                                className="w-full px-2 py-1 border border-slate-300 rounded text-[11px] focus:outline-none"
                              />
                              <button
                                onClick={() => handleAddNote(t.id)}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-bold"
                              >
                                +
                              </button>
                            </div>

                            <div className="space-y-1">
                              {(t.notes || []).map((n) => (
                                <div
                                  key={n.id}
                                  className="text-[10px] bg-white p-1.5 rounded border border-slate-200 space-y-0.5"
                                >
                                  <div className="flex justify-between text-[9px] text-slate-400">
                                    <span className="font-bold text-slate-700">
                                      {n.author}
                                    </span>
                                    <span>{n.createdAt}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>{n.content}</span>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => {
                                          setEditingNoteId(n.id);
                                          setEditingNoteText(n.content);
                                        }}
                                        className="text-slate-400 hover:text-blue-600"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteNote(t.id, n.id)
                                        }
                                        className="text-slate-400 hover:text-red-600"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 flex justify-between">
                            <span>📅 יעד: {t.dueDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}

        {/* ✏️ מודאל עריכת משימה למנהל */}
        {editingTask && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg border border-slate-200 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-600" />
                  עריכת פרטי משימה (מנהל)
                </h2>
                <button
                  onClick={() => setEditingTask(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditedTask} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      פרויקט
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTask.project}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          project: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      נושא משותף
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTask.topic}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          topic: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    משימה (תיאור)
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={editingTask.description}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    אחראים (בשורות נפרדות)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="משה גבעון&#10;ישראל ישראלי"
                    value={editingTask.assignee}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        assignee: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      סטטוס
                    </label>
                    <select
                      value={editingTask.status}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none font-bold"
                    >
                      <option value="פתוח">פתוח</option>
                      <option value="בטיפול">בטיפול</option>
                      <option value="בבדיקה">בבדיקה</option>
                      <option value="הושלם">הושלם</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      מספר דחיות
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingTask.postponeCount}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          postponeCount: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none font-bold text-amber-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      תאריך פתיחה
                    </label>
                    <input
                      type="date"
                      value={editingTask.createdAt}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          createdAt: e.target.value,
                        })
                      }
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      תאריך יעד
                    </label>
                    <input
                      type="date"
                      value={editingTask.dueDate}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          dueDate: e.target.value,
                        })
                      }
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      השלמה בפועל
                    </label>
                    <input
                      type="date"
                      value={editingTask.completedDate || ""}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          completedDate: e.target.value,
                        })
                      }
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" /> שמור שינויים
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ➕ מודאל הוספת נושא ומשימה תחת פרויקט */}
        {showNewTaskModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-5 w-full max-w-md border border-slate-200 shadow-xl space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-base font-bold text-slate-900">
                  הוספת נושא ומשימה
                </h2>
                <button
                  onClick={() => setShowNewTaskModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    1. שם הפרויקט
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="בחר או הקלד פרויקט..."
                    list="modal-projects-list"
                    value={newTask.project}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        project: e.target.value,
                        topic: "",
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                  />
                  <datalist id="modal-projects-list">
                    {projectsList.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    2. שם הנושא (חדש או קיים בפרויקט)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="הקלד את שם הנושא החדש..."
                    list="modal-topics-list"
                    value={newTask.topic}
                    onChange={(e) =>
                      setNewTask({ ...newTask, topic: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                  />
                  <datalist id="modal-topics-list">
                    {getTopicsForProject(newTask.project).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    3. משימה ראשונה בנושא זה
                  </label>
                  <textarea
                    required
                    placeholder="תיאור המשימה..."
                    rows={2}
                    value={newTask.description}
                    onChange={(e) =>
                      setNewTask({ ...newTask, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    אחראים (בשורות נפרדות)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="משה גבעון&#10;ישראל ישראלי"
                    value={newTask.assignee}
                    onChange={(e) =>
                      setNewTask({ ...newTask, assignee: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    תאריך יעד
                  </label>
                  <input
                    type="date"
                    required
                    value={newTask.dueDate}
                    onChange={(e) =>
                      setNewTask({ ...newTask, dueDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    שמור נושא ומשימה
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewTaskModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}