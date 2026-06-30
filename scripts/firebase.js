import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBBq8Wf-GEdUXm-fYjpvqLktGxkylPQTmI",
  authDomain: "tmapp-6f402.firebaseapp.com",
  projectId: "tmapp-6f402",
  storageBucket: "tmapp-6f402.firebasestorage.app",
  messagingSenderId: "729540723639",
  appId: "1:729540723639:web:09c5981457ffacb1401e32"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);