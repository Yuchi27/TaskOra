import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, addDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentCommentTaskId   = null;
let currentCommentOwnerUid = null;
let commentsUnsub          = null;

const REACTIONS = ["👍", "❤️", "😂", "😮", "🔥", "✅"];

// ── OPEN COMMENTS MODAL ──
export function openCommentsModal(taskId, task, ownerUid) {
  currentCommentTaskId   = taskId;
  currentCommentOwnerUid = ownerUid || auth.currentUser.uid;

  document.getElementById("comments-task-title").textContent = task.title;
  document.getElementById("comment-input").value = "";

  subscribeComments(taskId, currentCommentOwnerUid);
  document.getElementById("comments-modal").classList.add("open");
}

export function closeCommentsModal() {
  if (commentsUnsub) { commentsUnsub(); commentsUnsub = null; }
  document.getElementById("comments-modal").classList.remove("open");
}

// ── SUBSCRIBE REAL-TIME ──
function subscribeComments(taskId, ownerUid) {
  if (commentsUnsub) commentsUnsub();

  const ref = collection(db, "users", ownerUid, "tasks", taskId, "comments");
  const q   = query(ref, orderBy("createdAt", "asc"));

  commentsUnsub = onSnapshot(q, (snap) => {
    renderComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.error("Comments error:", err));
}

// ── RENDER COMMENTS ──
function renderComments(comments) {
  const list = document.getElementById("comments-list");

  if (!comments.length) {
    list.innerHTML = `<div class="comments-empty">No comments yet. Be the first!</div>`;
    return;
  }

  const me = auth.currentUser.uid;

  list.innerHTML = comments.map(c => {
    const isMe = c.authorUid === me;
    const time = c.createdAt?.toDate
      ? c.createdAt.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

    const reactionHtml = REACTIONS.map(emoji => {
      const users   = c.reactions?.[encodeEmoji(emoji)] || [];
      const count   = users.length;
      const reacted = users.includes(me);
      return `<button class="reaction-btn ${reacted ? "reacted" : ""}"
        onclick="toggleReaction('${c.id}', '${emoji}', '${c.authorUid}')">
        ${emoji}${count ? ` <span>${count}</span>` : ""}
      </button>`;
    }).join("");

    return `
      <div class="comment-item ${isMe ? "mine" : ""}">
        <div class="comment-avatar">
          ${c.authorPhoto
            ? `<img src="${c.authorPhoto}" alt="">`
            : `<i class="ti ti-user"></i>`}
        </div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">${c.authorName || "User"}</span>
            <span class="comment-time">${time}</span>
            ${isMe ? `<button class="comment-delete" onclick="deleteComment('${c.id}')"><i class="ti ti-trash"></i></button>` : ""}
          </div>
          <div class="comment-text">${escHtml(c.text)}</div>
          <div class="comment-reactions">${reactionHtml}</div>
        </div>
      </div>`;
  }).join("");

  list.scrollTop = list.scrollHeight;
}

// ── SEND COMMENT ──
export async function sendComment() {
  const input = document.getElementById("comment-input");
  const text  = input.value.trim();
  if (!text) return;

  const user = auth.currentUser;
  const ref  = collection(db, "users", currentCommentOwnerUid, "tasks", currentCommentTaskId, "comments");

  try {
    await addDoc(ref, {
      text,
      authorUid:   user.uid,
      authorName:  user.displayName || user.email?.split("@")[0] || "User",
      authorPhoto: user.photoURL || null,
      reactions:   {},
      createdAt:   serverTimestamp()
    });
    input.value = "";

    // Notify task owner kung dili ikaw ang owner
    if (currentCommentOwnerUid !== user.uid) {
      try {
        const { saveNotification } = await import("./notifications.js");
        const taskSnap = await getDoc(
          doc(db, "users", currentCommentOwnerUid, "tasks", currentCommentTaskId)
        );
        const taskTitle     = taskSnap.exists() ? taskSnap.data().title : "a task";
        const commenterName = user.displayName || user.email?.split("@")[0] || "Someone";
        await saveNotification(
          currentCommentOwnerUid,
          "💬 New Comment",
          `${commenterName} commented on "${taskTitle}"`,
          "/pages/tasks.html"
        );
      } catch (e) {
        console.log("Comment notification skipped:", e.message);
      }
    }

  } catch (err) {
    console.error("Send comment error:", err);
    alert(err.message);
  }
}

// ── TOGGLE REACTION ──
window.toggleReaction = async (commentId, emoji, authorUid) => {
  const me  = auth.currentUser.uid;
  const ref = doc(db, "users", currentCommentOwnerUid, "tasks", currentCommentTaskId, "comments", commentId);
  const key = encodeEmoji(emoji);

  try {
    const snap       = await getDoc(ref);
    if (!snap.exists()) return;

    const reactions  = snap.data().reactions || {};
    const users      = reactions[key] || [];
    const hasReacted = users.includes(me);

    await updateDoc(ref, {
      [`reactions.${key}`]: hasReacted ? arrayRemove(me) : arrayUnion(me)
    });

    // Notify comment author kung nag-react (dili kung nag-unreact)
    if (!hasReacted && authorUid && authorUid !== me) {
      try {
        const { saveNotification } = await import("./notifications.js");
        const reactorName = auth.currentUser.displayName
          || auth.currentUser.email?.split("@")[0] || "Someone";
        await saveNotification(
          authorUid,
          `${emoji} Reaction`,
          `${reactorName} reacted ${emoji} to your comment`,
          "/pages/tasks.html"
        );
      } catch (e) {
        console.log("Reaction notification skipped:", e.message);
      }
    }

  } catch (err) {
    console.error("Reaction error:", err);
  }
};

// ── DELETE COMMENT ──
window.deleteComment = async (commentId) => {
  if (!confirm("Delete this comment?")) return;
  try {
    await deleteDoc(
      doc(db, "users", currentCommentOwnerUid, "tasks", currentCommentTaskId, "comments", commentId)
    );
  } catch (err) {
    alert(err.message);
  }
};

// ── UTIL ──
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function encodeEmoji(emoji) {
  return [...emoji].map(c => c.codePointAt(0).toString(16)).join("_");
}

// Expose to window
window.openCommentsModal  = openCommentsModal;
window.closeCommentsModal = closeCommentsModal;
window.sendComment        = sendComment;