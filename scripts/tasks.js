import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allTasks = [];
let currentFilter = "all";
let searchQuery = "";
let editingId = null;
let currentUser = null;

function tasksRef() {
  return collection(db, "users", currentUser.uid, "tasks");
}

function taskDoc(id) {
  return doc(db, "users", currentUser.uid, "tasks", id);
}

function formatDeadline(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
    + " at " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function isToday(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toDateString() === new Date().toDateString();
}

function isPast(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d < new Date();
}

function buildCard(task) {
  const isDone = task.status === "completed";
  return `
  <div class="task-card" id="card-${task.id}">
    <div class="task-card-header">
      <div class="task-check ${isDone ? 'done' : ''}" onclick="toggleDone('${task.id}', ${isDone})">
        ${isDone ? '<i class="ti ti-check" style="font-size:13px"></i>' : ''}
      </div>
      <div class="task-title">${task.title}</div>
      <div style="position:relative">
        <button class="task-options" onclick="toggleMenu('${task.id}')">
          <i class="ti ti-dots-vertical"></i>
        </button>
        <div class="dropdown-menu" id="menu-${task.id}">
          <button onclick="editTask('${task.id}')"><i class="ti ti-edit"></i> Edit</button>
          <button class="del" onclick="deleteTask('${task.id}')"><i class="ti ti-trash"></i> Delete</button>
        </div>
      </div>
    </div>
    <div class="task-meta-row">
      <span class="priority-badge ${task.priority}">${task.priority}</span>
      ${task.deadline ? `<span class="meta-item"><i class="ti ti-calendar" style="font-size:13px"></i> ${formatDeadline(task.deadline)}</span>` : ''}
      ${task.workHours ? `<span class="meta-item"><i class="ti ti-clock" style="font-size:13px"></i> ${task.workHours}</span>` : ''}
    </div>
    ${task.category ? `<div style="margin-top:6px"><span class="cat-badge"><i class="ti ti-user" style="font-size:11px"></i> ${task.category}</span></div>` : ''}
  </div>`;
}

function renderTasks() {
  let tasks = [...allTasks];

  if (searchQuery) {
    tasks = tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (currentFilter === "todo") {
    tasks = tasks.filter(t => t.status !== "completed");
  } else if (currentFilter === "completed") {
    tasks = tasks.filter(t => t.status === "completed");
  } else if (currentFilter === "deadline") {
    tasks = tasks.filter(t => t.deadline && (isToday(t.deadline) || isPast(t.deadline)) && t.status !== "completed");
  }

  const todo      = tasks.filter(t => t.status !== "completed" && (!t.deadline || (!isToday(t.deadline) && !isPast(t.deadline))));
  const deadline  = tasks.filter(t => t.status !== "completed" && t.deadline && (isToday(t.deadline) || isPast(t.deadline)));
  const completed = tasks.filter(t => t.status === "completed");

  document.getElementById("col-todo").innerHTML =
    todo.length ? todo.map(buildCard).join("") : `<div class="col-empty">No tasks</div>`;
  document.getElementById("col-deadline").innerHTML =
    deadline.length ? deadline.map(buildCard).join("") : `<div class="col-empty">No deadlines today</div>`;
  document.getElementById("col-completed").innerHTML =
    completed.length ? completed.map(buildCard).join("") : `<div class="col-empty">No completed tasks</div>`;
}

function updateStats(tasks) {
  document.getElementById("total-tasks").textContent     = tasks.length;
  document.getElementById("pending-tasks").textContent   = tasks.filter(t => t.status !== "completed").length;
  document.getElementById("completed-tasks").textContent = tasks.filter(t => t.status === "completed").length;
  document.getElementById("high-tasks").textContent      = tasks.filter(t => t.priority === "High" && t.status !== "completed").length;
}

// ── MODAL ──
window.openModal = () => {
  editingId = null;
  document.getElementById("modal-title").textContent = "Add New Task";
  document.getElementById("t-title").value = "";
  document.getElementById("t-priority").value = "Medium";
  document.getElementById("t-category").value = "Personal";
  document.getElementById("t-deadline").value = "";
  document.getElementById("t-hours").value = "";
  document.getElementById("t-notes").value = "";
  document.getElementById("task-modal").classList.add("open");
};

window.closeModal = () => {
  document.getElementById("task-modal").classList.remove("open");
};

window.saveTask = async () => {
  try {
    const title = document.getElementById("t-title").value.trim();
    const priority = document.getElementById("t-priority").value;
    const category = document.getElementById("t-category").value;
    const dlVal = document.getElementById("t-deadline").value;
    const hours = document.getElementById("t-hours").value.trim();
    const notes = document.getElementById("t-notes").value.trim();

    if (!title) return alert("Please enter a task title.");

    const data = {
      title,
      priority,
      category,
      deadline: dlVal ? new Date(dlVal) : null,
      workHours: hours,
      notes,
      updatedAt: serverTimestamp()
    };

    if (editingId) {
      await updateDoc(taskDoc(editingId), data);
    } else {
      await addDoc(tasksRef(), {
        ...data,
        status: "todo",
        createdAt: serverTimestamp()
      });
    }

    alert("Task Saved!");
    closeModal();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
};

window.toggleDone = async (id, isDone) => {
  await updateDoc(taskDoc(id), { status: isDone ? "todo" : "completed", updatedAt: serverTimestamp() });
};

window.deleteTask = async (id) => {
  if (!confirm("Delete this task?")) return;
  await deleteDoc(taskDoc(id));
};

window.editTask = (id) => {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;
  document.getElementById("modal-title").textContent = "Edit Task";
  document.getElementById("t-title").value    = task.title;
  document.getElementById("t-priority").value = task.priority;
  document.getElementById("t-category").value = task.category || "Personal";
  document.getElementById("t-hours").value    = task.workHours || "";
  document.getElementById("t-notes").value    = task.notes || "";
  if (task.deadline) {
    const d = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById("t-deadline").value = local;
  } else {
    document.getElementById("t-deadline").value = "";
  }
  document.getElementById("task-modal").classList.add("open");
  toggleMenu(id);
};

window.toggleMenu = (id) => {
  document.querySelectorAll(".dropdown-menu").forEach(m => {
    if (m.id !== "menu-" + id) m.classList.remove("open");
  });
  document.getElementById("menu-" + id)?.classList.toggle("open");
};

window.setFilter = (f, el) => {
  currentFilter = f;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  renderTasks();
};

window.doSearch = () => {
  searchQuery = document.getElementById("search-input").value.trim();
  renderTasks();
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".task-options") && !e.target.closest(".dropdown-menu")) {
    document.querySelectorAll(".dropdown-menu").forEach(m => m.classList.remove("open"));
  }
  if (e.target === document.getElementById("task-modal")) closeModal();
});

document.getElementById("search-input").addEventListener("keyup", (e) => {
  if (e.key === "Enter") doSearch();
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

const q = query(tasksRef(), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    console.log("Snapshot fired! Number of tasks:", snap.docs.length);
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats(allTasks);
    renderTasks();
  }, (error) => {
    console.error("Snapshot ERROR:", error);
  });
});