import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;
    const { photoURL, name } = snap.data();

    // Update topbar avatar on every page
    const avatarEl = document.querySelector(".topbar .avatar");
    if (avatarEl) {
      if (photoURL) {
        avatarEl.innerHTML = `<img src="${photoURL}" alt="avatar"
          style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatarEl.innerHTML = `<i class="ti ti-user"></i>`;
      }
      // Make avatar clickable → settings
      avatarEl.style.cursor = "pointer";
      avatarEl.title = name || user.email;
      avatarEl.onclick = () => window.location.href = "settings.html";
    }
  } catch (e) {
    console.log("load-profile skipped:", e.message);
  }
});