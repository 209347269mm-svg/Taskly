import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCfuZSgJxDoQ_MJUXT4jbuD1dyehaitQM",
  authDomain: "task-manager-d5db8.firebaseapp.com",
  projectId: "task-manager-d5db8",
  storageBucket: "task-manager-d5db8.firebasestorage.app",
  messagingSenderId: "922918390940",
  appId: "1:922918390940:web:75d8667ceb49b58df17159",
  measurementId: "G-L8CX3W6GPX",
};

// אתחול Firebase
const app = initializeApp(firebaseConfig);

// ייצוא בסיס הנתונים
export const db = getFirestore(app);