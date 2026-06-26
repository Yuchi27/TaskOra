import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const darkToggle = document.getElementById("dark-toggle");

function syncToggleUI() {
  const isDark = window.getTheme() === "dark";
  darkToggle.classList.toggle("on", isDark);
}

darkToggle.addEventListener("click", () => {
  window.toggleTheme();
  syncToggleUI();
});

async function doLogout() {
  await signOut(auth);
  window.location.replace("auth.html");
}

document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); doLogout(); });
document.getElementById("settings-logout-btn").addEventListener("click", doLogout);

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.replace("auth.html"); return; }
  document.getElementById("profile-name").textContent = user.displayName || user.email.split("@")[0];
  document.getElementById("profile-email").textContent = user.email;
  syncToggleUI();
});