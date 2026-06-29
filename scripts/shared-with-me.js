import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initNotifications, loadNotifications } from "./notifications.js";

const PERM_LABELS = {
  view:    { label: "View only",            icon: "ti-eye" },
  comment: { label: "View + Comment",        icon: "ti-message" },
  edit:    { label: "View + Comment + Edit", icon: "ti-edit" },
  full:    { label: "Full Access",           icon: "ti-shield-check" }
};

function formatDeadline(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function buildCard(share, task) {
  const perm     = PERM_LABELS[share.permission] || PERM_LABELS.view;
  const isDone   = task?.status === "completed";
  const canComment = ["comment", "edit", "full"].includes(share.permission);

  return `
    <div class="swm-card" id="swm-card-${share.taskId}">
      <div class="swm-card-top">
        <div class="swm-task-title">${task?.title || share.taskTitle || "Untitled Task"}</div>
      </div>

      <div class="swm-owner">
        <i class="ti ti-user"></i>
        Shared by <strong style="margin-left:3px">${share.ownerName || "Someone"}</strong>
        <span class="shared-at">· ${timeAgo(share.sharedAt)}</span>
      </div>

      <div class="swm-meta">
        ${task?.priority ? `<span class="priority-badge ${task.priority}">${task.priority}</span>` : ""}
        <span class="perm-badge"><i class="ti ${perm.icon}"></i> ${perm.label}</span>
        ${task?.deadline ? `<span class="meta-item"><i class="ti ti-calendar" style="font-size:12px"></i> ${formatDeadline(task.deadline)}</span>` : ""}
      </div>

      <div class="swm-status">
        <div class="status-dot ${isDone ? "done" : "pending"}"></div>
        ${isDone ? "Completed" : "In Progress"}
      </div>

      <div class="swm-actions">
        ${canComment
          ? `<button class="swm-btn comment" onclick="openSharedComments('${share.taskId}', '${share.ownerUid}', ${JSON.stringify(task?.title || share.taskTitle || "Task").replace(/'/g, "\\'")})">
               <i class="ti ti-message-circle"></i> Comments
             </button>`
          : `<button class="swm-btn comment" style="opacity:0.4;cursor:not-allowed" disabled>
               <i class="ti ti-eye"></i> View only
             </button>`
        }
        <button class="swm-btn view" onclick="window.open('../pages/shared-task.html?task=${share.taskId}&owner=${share.ownerUid}', '_blank')">
          <i class="ti ti-external-link"></i> Open Task
        </button>
      </div>
    </div>`;
}

// Open comments from shared-with-me page
window.openSharedComments = (taskId, ownerUid, taskTitle) => {
  const task = { title: taskTitle };
  // Use the openCommentsModal from task-comments.js but with ownerUid override
  import("./task-comments.js").then(mod => {
    mod.openCommentsModal(taskId, task, ownerUid);
  });
};

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.replace("auth.html"); return; }

  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.replace("auth.html");
  });

  try {
    await initNotifications(user.uid);
    loadNotifications(user.uid);
  } catch (e) {
    console.log("Notifications skipped:", e.message);
  }

  // Listen to sharedWithMe collection
  const sharedRef = collection(db, "users", user.uid, "sharedWithMe");

  onSnapshot(sharedRef, async (snap) => {
    const shares = snap.docs.map(d => ({ taskId: d.id, ...d.data() }));

    document.getElementById("swm-loading").style.display = "none";
    document.getElementById("swm-count").textContent = shares.length;

    if (!shares.length) {
      document.getElementById("swm-empty").style.display = "block";
      document.getElementById("swm-grid").style.display = "none";
      return;
    }

    document.getElementById("swm-empty").style.display = "none";
    document.getElementById("swm-grid").style.display = "grid";

    // Fetch each task's current data from owner's collection
    const cards = await Promise.all(shares.map(async (share) => {
      try {
        const taskSnap = await getDoc(doc(db, "users", share.ownerUid, "tasks", share.taskId));
        const task = taskSnap.exists() ? { id: taskSnap.id, ...taskSnap.data() } : null;
        return buildCard(share, task);
      } catch (e) {
        return buildCard(share, null);
      }
    }));

    document.getElementById("swm-grid").innerHTML = cards.join("");
  }, err => {
    console.error("sharedWithMe snapshot error:", err);
    document.getElementById("swm-loading").innerHTML = "Error loading shared tasks.";
  });
});