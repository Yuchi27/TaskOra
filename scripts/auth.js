import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBBq8Wf-GEdUXm-fYjpvqLktGxkylPQTmI",
  authDomain: "tmapp-6f402.firebaseapp.com",
  projectId: "tmapp-6f402",
  storageBucket: "tmapp-6f402.firebasestorage.app",
  messagingSenderId: "729540723639",
  appId: "1:729540723639:web:09c5981457ffacb1401e32"
};

const auth = getAuth(initializeApp(firebaseConfig));

// Kung naka-login na, diretso dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace("dashboard.html");
  }
});

window.show = (v) => {
  ['login', 'register', 'forgot'].forEach(x => {
    document.getElementById('v-' + x).style.display = 'none';
  });
  document.getElementById('v-' + v).style.display = 'flex';
  ['li-msg', 'rg-msg', 'fp-msg'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.textContent = ''; e.className = 'msg'; }
  });
};

const setMsg = (id, text, type) => {
  const e = document.getElementById(id);
  e.textContent = text;
  e.className = 'msg ' + type;
};

window.doLogin = async () => {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const rem   = document.getElementById('li-rem').checked;

  if (!email || !pass) return setMsg('li-msg', 'Fill in all fields.', 'err');

  try {
    await setPersistence(auth, rem ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, pass);
    window.location.replace("dashboard.html");
  } catch (e) {
    const errors = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-not-found':     'No account with that email.',
      'auth/wrong-password':     'Incorrect password.',
      'auth/too-many-requests':  'Too many attempts. Try again later.'
    };
    setMsg('li-msg', errors[e.code] || e.message, 'err');
  }
};

window.doRegister = async () => {
  const name  = document.getElementById('rg-name').value.trim();
  const email = document.getElementById('rg-email').value.trim();
  const pass  = document.getElementById('rg-pass').value;
  const pass2 = document.getElementById('rg-pass2').value;

  if (!name || !email || !pass || !pass2) return setMsg('rg-msg', 'Fill in all fields.', 'err');
  if (pass !== pass2) return setMsg('rg-msg', 'Passwords do not match.', 'err');
  if (pass.length < 6) return setMsg('rg-msg', 'Password must be 6+ characters.', 'err');

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    window.location.replace("dashboard.html");
  } catch (e) {
    const errors = {
      'auth/email-already-in-use': 'Email already registered.',
      'auth/invalid-email':        'Invalid email address.',
      'auth/weak-password':        'Password is too weak.'
    };
    setMsg('rg-msg', errors[e.code] || e.message, 'err');
  }
};

window.doForgot = async () => {
  const email = document.getElementById('fp-email').value.trim();
  if (!email) return setMsg('fp-msg', 'Enter your email.', 'err');

  try {
    await sendPasswordResetEmail(auth, email);
    setMsg('fp-msg', 'Reset link sent! Check your inbox.', 'ok');
  } catch (e) {
    const errors = {
      'auth/user-not-found': 'No account with that email.',
      'auth/invalid-email':  'Invalid email address.'
    };
    setMsg('fp-msg', errors[e.code] || e.message, 'err');
  }
};