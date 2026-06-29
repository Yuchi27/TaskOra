import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allNotes = [];
let allTasks = [];
let currentUser = null;
let editingNoteId = null;
let selectedNoteId = null;
let selectedColor = "c-yellow";
let searchQuery = "";
let saveTimer = null;
let pendingBlankTaskId = null;
let activeFolder = "notes";
let expandedFolders = new Set();

const NOTE_COLORS = ["c-yellow", "c-blue", "c-green", "c-pink", "c-purple", "c-orange", "c-white"];

function notesRef() {
  return collection(db, "users", currentUser.uid, "notes");
}
function noteDoc(id) {
  return doc(db, "users", currentUser.uid, "notes", id);
}
function tasksRef() {
  return collection(db, "users", currentUser.uid, "tasks");
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    + " at " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── RENDER FOLDER LIST ──
function renderFolderList() {
  const list = document.getElementById("notes-list");
  const pureNotes = allNotes.filter(n => !n.taskId);
  const taskFolders = allTasks
    .map(t => ({
      task: t,
      notes: allNotes.filter(n => n.taskId === t.id)
    }))
    .sort((a, b) => {
      const aDone = a.task.status === "completed" ? 1 : 0;
      const bDone = b.task.status === "completed" ? 1 : 0;
      return aDone - bDone; // not-done una, completed sa ubos
    });

  let html = "";

  // ── MY NOTES FOLDER ──
  html += `
    <div class="folder-item ${activeFolder === "notes" ? "active" : ""}" onclick="selectFolder('notes')">
      <div class="folder-item-top">
        <i class="ti ti-notebook folder-icon notes-folder-icon"></i>
        <span class="folder-item-title">My Notes</span>
        <span class="folder-count">${pureNotes.length}</span>
      </div>
    </div>`;

  // Notes under My Notes (kung active)
  if (activeFolder === "notes") {
    const visibleNotes = getVisibleNotes();
    if (!visibleNotes.length) {
      html += `
        <div class="notes-empty" style="padding:20px">
          <i class="ti ti-notebook"></i>
          <p>${searchQuery ? "No results" : "No notes yet"}</p>
          <span>${searchQuery ? "Try a different search" : "Tap + to create one"}</span>
        </div>`;
    } else {
      html += visibleNotes.map(n => buildNoteItem(n, false)).join("");
    }
  }

  // ── TASK FOLDERS ──
  if (taskFolders.length) {
    html += `<div class="folder-section-label">TASKS</div>`;

    taskFolders.forEach(({ task, notes }) => {
      const isActive = activeFolder === task.id;
      const isExpanded = expandedFolders.has(task.id);

      html += `
        <div class="folder-item ${isActive ? "active" : ""}">
          <div class="folder-item-top" onclick="selectFolder('${task.id}')">
            <i class="ti ti-checkbox folder-icon task-folder-icon priority-${(task.priority || "medium").toLowerCase()}"></i>
            <span class="folder-item-title">${esc(task.title)}</span>
            <span class="folder-count">${notes.length}</span>
            ${notes.length ? `
              <i class="ti ti-chevron-${isExpanded ? "down" : "right"} folder-chevron"
                 onclick="event.stopPropagation(); toggleFolderExpand('${task.id}')"></i>` : ""}
          </div>
          <div class="folder-item-meta">
            <span class="priority-dot priority-${(task.priority || "medium").toLowerCase()}"></span>
            ${task.priority || "Medium"}
            ${task.status === "completed" ? ' · <span style="color:#66bb6a">Done</span>' : ""}
          </div>
        </div>`;

      // Notes under this task — pakita ra kung expanded
      if (isExpanded) {
        const taskNotes = notes.filter(n => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (n.title || "").toLowerCase().includes(q) ||
                 (n.body || "").toLowerCase().includes(q) ||
                 (n.tag || "").toLowerCase().includes(q);
        });
        if (taskNotes.length) {
          html += taskNotes.map(n => buildNoteItem(n, true)).join("");
        }
      }
    });
  }

  // Update count
  const visibleNotes = getVisibleNotes();
  document.getElementById("np-count").textContent =
    `${visibleNotes.length} note${visibleNotes.length !== 1 ? "s" : ""}`;

  list.innerHTML = html;
}

function getVisibleNotes() {
  let notes = activeFolder === "notes"
    ? allNotes.filter(n => !n.taskId)
    : allNotes.filter(n => n.taskId === activeFolder);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    notes = notes.filter(n =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.body || "").toLowerCase().includes(q) ||
      (n.tag || "").toLowerCase().includes(q)
    );
  }
  return notes;
}

function buildNoteItem(n, indented = false) {
  return `
    <div class="note-item ${indented ? "note-item-indented" : ""} ${n.id === selectedNoteId ? "active" : ""}"
         id="nitem-${n.id}"
         onclick="selectNote('${n.id}')">
      <div class="note-item-top">
        <div class="note-item-dot ${n.color || "c-yellow"}"></div>
        <div class="note-item-title">${esc(n.title || "Untitled")}</div>
        <div class="note-item-date">${formatDate(n.updatedAt || n.createdAt)}</div>
      </div>
      <div class="note-item-preview">${esc((n.body || "").replace(/\n/g, " ")) || "No content"}</div>
      ${n.tag ? `<span class="note-item-tag">${esc(n.tag)}</span>` : ""}
    </div>`;
}

// ── TOGGLE EXPAND/COLLAPSE SA TASK FOLDER ──
window.toggleFolderExpand = (taskId) => {
  if (expandedFolders.has(taskId)) {
    expandedFolders.delete(taskId);
  } else {
    expandedFolders.add(taskId);
  }
  renderFolderList();
};

// ── SELECT FOLDER ──
window.selectFolder = (folderId) => {
  flushPending(); // background save, dili gina-await
  activeFolder = folderId;
  selectedNoteId = null;
  editingNoteId = null;
  renderFolderList();

  if (folderId !== "notes") {
    const taskNotes = allNotes.filter(n => n.taskId === folderId);
    if (taskNotes.length > 0) {
      const first = taskNotes[0];
      selectedNoteId = first.id;
      startInlineEdit(first.id);
    } else {
      openBlankTaskEditor(folderId);
    }
  } else {
    resetDetail();
  }
};

// ── BLANK EDITOR (bag-ong note, wala pa sa Firestore) ──
function openBlankTaskEditor(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  editingNoteId = null;
  selectedColor = "c-yellow";

  const detail = document.getElementById("note-detail");
  detail.classList.add("mobile-open");

  detail.innerHTML = `
    <div class="nd-color-bar c-yellow" id="nd-edit-colorbar"></div>
    <div class="nd-content">
      <div class="nd-topbar">
        <button class="nd-btn" onclick="goBackList()" style="display:none" id="nd-back-btn">
          <i class="ti ti-arrow-left"></i> Back
        </button>
        <div style="flex:1"></div>
        <div class="nd-actions">
          <span class="nd-autosave-label" id="nd-autosave-label"></span>
        </div>
      </div>
      <div class="nd-task-banner">
        <i class="ti ti-checkbox"></i>
        <span>Task: <strong>${esc(task.title)}</strong></span>
      </div>
      <div class="nd-body nd-edit-body">
        <input class="nd-edit-title" id="nd-edit-title" type="text" value=""
          placeholder="Title" oninput="scheduleBlankSave('${taskId}')" />
        <div class="nd-edit-meta">
          <span class="nd-date"></span>
          <input class="nd-edit-tag" id="nd-edit-tag" type="text" value=""
            placeholder="Add tag..." oninput="scheduleBlankSave('${taskId}')" />
        </div>
        <div class="nd-edit-colors" id="nd-edit-colors"></div>
        <textarea class="nd-edit-text" id="nd-edit-text" placeholder="Write something..."
          oninput="autoResizeTA(this);scheduleBlankSave('${taskId}')"></textarea>
      </div>
    </div>`;

  if (window.innerWidth <= 768) {
    document.getElementById("nd-back-btn").style.display = "flex";
  }

  buildInlineColorPicker();
  document.getElementById("nd-edit-title").focus();
}

window.scheduleBlankSave = (taskId) => {
  pendingBlankTaskId = taskId;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => createAndSaveNote(taskId), 500);
};

async function createAndSaveNote(taskId) {
  const title = document.getElementById("nd-edit-title")?.value.trim() || "";
  const body  = document.getElementById("nd-edit-text")?.value || "";
  const tag   = document.getElementById("nd-edit-tag")?.value.trim() || "";

  if (!title && !body) {
    pendingBlankTaskId = null;
    return;
  }

  const label = document.getElementById("nd-autosave-label");
  if (label) label.textContent = "Saving...";

  try {
    const ref = await addDoc(notesRef(), {
      title: title || "Untitled",
      body, tag,
      color: selectedColor,
      taskId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    editingNoteId = ref.id;
    selectedNoteId = ref.id;
    pendingBlankTaskId = null;

    if (label) {
      label.textContent = "Saved";
      setTimeout(() => { if (label) label.textContent = ""; }, 1500);
    }

    document.getElementById("nd-edit-title")?.setAttribute("oninput", "scheduleAutosave()");
    document.getElementById("nd-edit-tag")?.setAttribute("oninput", "scheduleAutosave()");
    document.getElementById("nd-edit-text")?.setAttribute("oninput", "autoResizeTA(this);scheduleAutosave()");

  } catch (err) {
    console.error(err);
    if (label) label.textContent = "Error saving";
  }
}

function resetDetail() {
  const detail = document.getElementById("note-detail");
  detail.classList.remove("mobile-open");
  detail.innerHTML = `
    <div class="nd-empty">
      <i class="ti ti-notebook" style="font-size:52px;color:#d0d8e8;display:block;margin-bottom:14px;"></i>
      <p style="font-size:16px;font-weight:700;color:#8a9bb0;">Select a note</p>
      <span style="font-size:13px;color:#a0aab8;">or create a new one</span>
    </div>`;
}

// ── SELECT NOTE ──
window.selectNote = (id) => {
  flushPending(); // background save, dili gina-await
  selectedNoteId = id;
  renderFolderList();
  startInlineEdit(id);
};

// ── INLINE EDIT ──
window.startInlineEdit = (id) => {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;
  editingNoteId = id;
  selectedColor = note.color || "c-yellow";

  const detail = document.getElementById("note-detail");
  detail.classList.add("mobile-open");

  const task = note.taskId ? allTasks.find(t => t.id === note.taskId) : null;
  const taskBanner = task ? `
    <div class="nd-task-banner">
      <i class="ti ti-checkbox"></i>
      <span>Task: <strong>${esc(task.title)}</strong></span>
      <span class="priority-dot priority-${(task.priority || "medium").toLowerCase()}"></span>
      <span style="font-size:11px;color:#8a9bb0">${task.priority || "Medium"}</span>
    </div>` : "";

  detail.innerHTML = `
    <div class="nd-color-bar ${selectedColor}" id="nd-edit-colorbar"></div>
    <div class="nd-content">
      <div class="nd-topbar">
        <button class="nd-btn" onclick="goBackList()" style="display:none" id="nd-back-btn">
          <i class="ti ti-arrow-left"></i> Back
        </button>
        <div style="flex:1"></div>
        <div class="nd-actions">
          <span class="nd-autosave-label" id="nd-autosave-label"></span>
          <button class="nd-btn danger" onclick="deleteNote('${note.id}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
      ${taskBanner}
      <div class="nd-body nd-edit-body">
        <input class="nd-edit-title" id="nd-edit-title" type="text"
          value="${esc(note.title || "")}" placeholder="Title"
          oninput="scheduleAutosave()" />
        <div class="nd-edit-meta">
          <span class="nd-date">${formatDateFull(note.updatedAt || note.createdAt)}</span>
          <input class="nd-edit-tag" id="nd-edit-tag" type="text"
            value="${esc(note.tag || "")}" placeholder="Add tag..."
            oninput="scheduleAutosave()" />
        </div>
        <div class="nd-edit-colors" id="nd-edit-colors"></div>
        <textarea class="nd-edit-text" id="nd-edit-text" placeholder="Write something..."
          oninput="autoResizeTA(this);scheduleAutosave()"
        >${esc(note.body || "")}</textarea>
      </div>
    </div>`;

  if (window.innerWidth <= 768) {
    document.getElementById("nd-back-btn").style.display = "flex";
  }

  buildInlineColorPicker();
  const ta = document.getElementById("nd-edit-text");
  autoResizeTA(ta);
};

window.autoResizeTA = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

function buildInlineColorPicker() {
  const row = document.getElementById("nd-edit-colors");
  if (!row) return;
  row.innerHTML = NOTE_COLORS.map(c => `
    <div class="color-swatch ${c} ${c === selectedColor ? "selected" : ""}"
         data-color="${c}" onclick="pickInlineColor('${c}')"
         title="${c.replace("c-", "")}"></div>
  `).join("");
}

window.pickInlineColor = (color) => {
  selectedColor = color;
  document.querySelectorAll("#nd-edit-colors .color-swatch").forEach(s => {
    s.classList.toggle("selected", s.dataset.color === color);
  });
  const bar = document.getElementById("nd-edit-colorbar");
  if (bar) bar.className = `nd-color-bar ${color}`;
  scheduleAutosave();
};

// ── AUTO-SAVE ──
window.scheduleAutosave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => doAutosave(), 500);
};

async function doAutosave(idOverride) {
  const noteId = idOverride || editingNoteId;
  if (!noteId) return;
  const title = document.getElementById("nd-edit-title")?.value.trim() || "";
  const body  = document.getElementById("nd-edit-text")?.value || "";
  const tag   = document.getElementById("nd-edit-tag")?.value.trim() || "";

  const label = document.getElementById("nd-autosave-label");
  if (label) label.textContent = "Saving...";

  try {
    await updateDoc(noteDoc(noteId), {
      title: title || "Untitled",
      body, tag,
      color: selectedColor,
      updatedAt: serverTimestamp()
    });
    if (label) {
      label.textContent = "Saved";
      setTimeout(() => { if (label) label.textContent = ""; }, 1500);
    }
  } catch (err) {
    console.error(err);
    if (label) label.textContent = "Error saving";
  }
}

// ── FLUSH: i-save dayon ang pending edits sa karon nga note/blank task
//    una mubalhin sa lain nga note/folder, aron dili mawala o ma-save
//    sa SAYOP nga note ang content. ──
async function flushPending() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (editingNoteId && document.getElementById("nd-edit-title")) {
    await doAutosave(editingNoteId);
  } else if (pendingBlankTaskId && document.getElementById("nd-edit-title")) {
    await createAndSaveNote(pendingBlankTaskId);
    pendingBlankTaskId = null;
  }
}

// ── ADD NOTE (modal) ──
window.openNoteModal = () => {
  editingNoteId = null;
  document.getElementById("note-modal-title").textContent = "New Note";
  document.getElementById("n-title").value = "";
  document.getElementById("n-body").value = "";
  document.getElementById("n-tag").value = "";
  renderModalTaskInfo();
  setColor("c-yellow");
  document.getElementById("note-modal").classList.add("open");
};

function renderModalTaskInfo() {
  let taskRow = document.getElementById("n-task-row");
  if (!taskRow) {
    taskRow = document.createElement("div");
    taskRow.id = "n-task-row";
    taskRow.className = "fld";
    const colorFld = document.getElementById("color-picker-row")?.closest(".fld");
    if (colorFld) colorFld.before(taskRow);
  }

  if (activeFolder !== "notes") {
    const task = allTasks.find(t => t.id === activeFolder);
    taskRow.innerHTML = `
      <label>Linked Task</label>
      <div class="nd-task-banner" style="margin:0">
        <i class="ti ti-checkbox"></i>
        <span><strong>${esc(task?.title || "")}</strong></span>
      </div>`;
  } else {
    taskRow.innerHTML = `
      <label>Link to Task <span style="font-weight:400;color:#8a9bb0">(optional)</span></label>
      <select id="n-task-link" style="background:#f0f2f8;border:1.5px solid #d0d8e8;border-radius:10px;padding:10px 14px;font-size:13px;color:#1a2537;outline:none;font-family:'Inter',sans-serif;">
        <option value="">— None (My Notes) —</option>
        ${allTasks.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}
      </select>`;
  }
}

window.closeNoteModal = () => {
  document.getElementById("note-modal").classList.remove("open");
};

window.saveNote = async () => {
  const title = document.getElementById("n-title").value.trim();
  const body  = document.getElementById("n-body").value.trim();
  const tag   = document.getElementById("n-tag").value.trim();

  if (!title && !body) {
    alert("Please add a title or some content.");
    return;
  }

  let taskId = null;
  if (activeFolder !== "notes") {
    taskId = activeFolder;
  } else {
    const sel = document.getElementById("n-task-link");
    if (sel?.value) taskId = sel.value;
  }

  const data = {
    title: title || "Untitled",
    body, tag,
    color: selectedColor,
    taskId: taskId || null,
    updatedAt: serverTimestamp()
  };

  try {
    const ref = await addDoc(notesRef(), { ...data, createdAt: serverTimestamp() });
    selectedNoteId = ref.id;
    if (taskId) {
      activeFolder = taskId;
      expandedFolders.add(taskId);
    }
    closeNoteModal();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
};

// ── DELETE ──
window.deleteNote = async (id) => {
  if (!confirm("Delete this note?")) return;
  try {
    await deleteDoc(noteDoc(id));
    selectedNoteId = null;
    editingNoteId = null;
    resetDetail();
  } catch (err) {
    console.error(err);
  }
};

// ── COLOR PICKER (modal) ──
function setColor(color) {
  selectedColor = color;
  document.querySelectorAll(".color-swatch").forEach(s => {
    s.classList.toggle("selected", s.dataset.color === color);
  });
}

function buildColorPicker() {
  const row = document.getElementById("color-picker-row");
  row.innerHTML = NOTE_COLORS.map(c => `
    <div class="color-swatch ${c}" data-color="${c}" onclick="pickColor('${c}')"
         title="${c.replace("c-", "")}"></div>
  `).join("");
  setColor("c-yellow");
}

window.pickColor = (color) => setColor(color);

// ── BACK (mobile) ──
window.goBackList = () => {
  flushPending(); // background save, dili gina-await
  document.getElementById("note-detail").classList.remove("mobile-open");
  selectedNoteId = null;
  editingNoteId = null;
  renderFolderList();
};

// ── SEARCH ──
document.getElementById("note-search").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderFolderList();
});

// ── CLOSE MODAL ON BACKDROP ──
document.addEventListener("click", (e) => {
  if (e.target === document.getElementById("note-modal")) closeNoteModal();
});

// ── AUTH + FIRESTORE ──
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.replace("auth.html"); return; }
  currentUser = user;

  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.replace("auth.html");
  });

  buildColorPicker();

  const tq = query(tasksRef(), orderBy("createdAt", "desc"));
  onSnapshot(tq, (snap) => {
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFolderList();
  }, (err) => console.error("Tasks error:", err));

  const nq = query(notesRef(), orderBy("createdAt", "desc"));
  onSnapshot(nq, (snap) => {
    allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFolderList();
    if (selectedNoteId && !editingNoteId) {
      const stillExists = allNotes.find(n => n.id === selectedNoteId);
      if (stillExists) startInlineEdit(selectedNoteId);
    }
  }, (err) => console.error("Notes error:", err));
});