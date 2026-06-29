import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentShareTaskId = null;
let currentShareTask   = null;

// ── PERMISSION LEVELS ──
export const PERMISSIONS = {
  view:      { label: "View only",             icon: "ti-eye" },
  comment:   { label: "View + Comment",         icon: "ti-message" },
  edit:      { label: "View + Comment + Edit",  icon: "ti-edit" },
  full:      { label: "Full Access",            icon: "ti-shield-check" }
};

// ── OPEN SHARE MODAL ──
export function openShareModal(taskId, task) {
  currentShareTaskId = taskId;
  currentShareTask   = task;

  document.getElementById("share-task-title").textContent = task.title;
  document.getElementById("share-email-input").value = "";
  document.getElementById("share-perm-select").value = "comment";
  document.getElementById("share-msg").textContent   = "";

 
  loadSharedUsers(taskId);

  document.getElementById("share-modal").classList.add("open");
}

export function closeShareModal() {
  document.getElementById("share-modal").classList.remove("open");
}



// ── INVITE BY EMAIL ──
export async function inviteByEmail() {
  const email = document.getElementById("share-email-input").value.trim().toLowerCase();
  const perm  = document.getElementById("share-perm-select").value;

  if (!email) return showShareMsg("Enter an email address.", "error");
  if (email === auth.currentUser.email.toLowerCase())
    return showShareMsg("You can't share with yourself.", "error");

  try {
    // Find user by email
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("email", "==", email))
    );

    if (usersSnap.empty) {
      return showShareMsg("No TaskOra account found with that email.", "error");
    }

    const targetUser = usersSnap.docs[0];
    const targetUid  = targetUser.id;

    // Write share record under owner's task
    await setDoc(
      doc(db, "users", auth.currentUser.uid, "tasks", currentShareTaskId, "shares", targetUid),
      {
        uid:         targetUid,
        email:       email,
        displayName: targetUser.data().name || email,
        permission:  perm,
        sharedAt:    serverTimestamp()
      }
    );

    // Write incoming share record under target user
    const ownerName = auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "Someone";
    await setDoc(
      doc(db, "users", targetUid, "sharedWithMe", currentShareTaskId),
      {
        taskId:      currentShareTaskId,
        ownerUid:    auth.currentUser.uid,
        ownerName:   ownerName,
        permission:  perm,
        taskTitle:   currentShareTask.title,
        sharedAt:    serverTimestamp()
      }
    );

    // Send notification to target user
    try {
      await addDoc(
        collection(db, "users", targetUid, "notifications"),
        {
          title:   "Task Shared with You",
          body:    `${ownerName} shared "${currentShareTask.title}" with you.`,
          link:    "shared-with-me.html",
          read:    false,
          createdAt: serverTimestamp()
        }
      );
    } catch (e) {
      console.log("Notification send skipped:", e.message);
    }

    document.getElementById("share-email-input").value = "";
    showShareMsg(`Shared with ${email}!`, "success");
    loadSharedUsers(currentShareTaskId);

  } catch (err) {
    console.error(err);
    showShareMsg(err.message, "error");
  }
}

// ── LOAD SHARED USERS LIST ──
async function loadSharedUsers(taskId) {
  const container = document.getElementById("shared-users-list");
  container.innerHTML = `<div class="share-loading">Loading...</div>`;

  try {
    const snap = await getDocs(
      collection(db, "users", auth.currentUser.uid, "tasks", taskId, "shares")
    );

    if (snap.empty) {
      container.innerHTML = `<div class="share-empty">Not shared with anyone yet.</div>`;
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const s = d.data();
      const permLabel = PERMISSIONS[s.permission]?.label || s.permission;
      const permIcon  = PERMISSIONS[s.permission]?.icon  || "ti-user";
      return `
        <div class="shared-user-row" id="srow-${d.id}">
          <div class="shared-user-avatar"><i class="ti ti-user"></i></div>
          <div class="shared-user-info">
            <div class="shared-user-name">${s.displayName || s.email}</div>
            <div class="shared-user-email">${s.email}</div>
          </div>
          <select class="shared-perm-select" onchange="updateSharePerm('${d.id}', this.value)">
            ${Object.entries(PERMISSIONS).map(([k, v]) =>
              `<option value="${k}" ${k === s.permission ? "selected" : ""}>${v.label}</option>`
            ).join("")}
          </select>
          <button class="shared-remove-btn" onclick="removeShare('${d.id}', '${s.email}')">
            <i class="ti ti-x"></i>
          </button>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<div class="share-empty">Error loading shares.</div>`;
    console.error(err);
  }
}

// ── UPDATE PERMISSION ──
window.updateSharePerm = async (uid, newPerm) => {
  try {
    await setDoc(
      doc(db, "users", auth.currentUser.uid, "tasks", currentShareTaskId, "shares", uid),
      { permission: newPerm },
      { merge: true }
    );
    // Also update incoming record
    await setDoc(
      doc(db, "users", uid, "sharedWithMe", currentShareTaskId),
      { permission: newPerm },
      { merge: true }
    );
    showShareMsg("Permission updated.", "success");
  } catch (err) {
    showShareMsg(err.message, "error");
  }
};

// ── REMOVE SHARE ──
window.removeShare = async (uid, email) => {
  if (!confirm(`Remove access for ${email}?`)) return;
  try {
    await deleteDoc(
      doc(db, "users", auth.currentUser.uid, "tasks", currentShareTaskId, "shares", uid)
    );
    await deleteDoc(
      doc(db, "users", uid, "sharedWithMe", currentShareTaskId)
    );
    document.getElementById(`srow-${uid}`)?.remove();
    showShareMsg("Access removed.", "success");
    loadSharedUsers(currentShareTaskId);
  } catch (err) {
    showShareMsg(err.message, "error");
  }
};

// ── UTIL ──
function showShareMsg(text, type) {
  const el = document.getElementById("share-msg");
  el.textContent = text;
  el.className   = `share-msg ${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "share-msg"; }, 3000);
}

// Expose to window
window.openShareModal  = openShareModal;
window.closeShareModal = closeShareModal;

window.inviteByEmail   = inviteByEmail;