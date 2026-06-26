import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function taskDate(t) {
  if (!t.deadline) return null;
  return t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
}

function completedDate(t) {
  // fall back to updatedAt if present, else deadline
  if (t.updatedAt) return t.updatedAt.toDate ? t.updatedAt.toDate() : new Date(t.updatedAt);
  return taskDate(t);
}

function renderBars(containerId, counts, fillClass) {
  const el = document.getElementById(containerId);
  const max = Math.max(...Object.values(counts), 1);
  el.innerHTML = Object.entries(counts).map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill ${typeof fillClass === "function" ? fillClass(label) : fillClass}" style="width:${(count / max) * 100}%"></div></div>
      <div class="bar-count">${count}</div>
    </div>`).join("");
}

function renderWeekChart(tasks) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const counts = days.map(d => {
    return tasks.filter(t => {
      if (t.status !== "completed") return false;
      const cd = completedDate(t);
      return cd && cd.toDateString() === d.toDateString();
    }).length;
  });

  const max = Math.max(...counts, 1);
  const el = document.getElementById("week-chart");
  el.innerHTML = days.map((d, i) => `
    <div class="week-col">
      <div class="week-count">${counts[i]}</div>
      <div class="week-bar" style="height:${(counts[i] / max) * 100}%"></div>
      <div class="week-day">${d.toLocaleDateString("en-US", { weekday: "short" })}</div>
    </div>`).join("");
}

document.getElementById("logout-btn").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.replace("auth.html");
});

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.replace("auth.html"); return; }

  const tasksRef = collection(db, "users", user.uid, "tasks");
  onSnapshot(tasksRef, (snap) => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const now = new Date();

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    const overdue = tasks.filter(t => t.status !== "completed" && taskDate(t) && taskDate(t) < now).length;
    const high = tasks.filter(t => t.status !== "completed" && t.priority === "High").length;

    document.getElementById("a-total").textContent = total;
    document.getElementById("a-rate").textContent = `${rate}%`;
    document.getElementById("a-overdue").textContent = overdue;
    document.getElementById("a-high").textContent = high;

    const priorityCounts = {
      High: tasks.filter(t => t.priority === "High").length,
      Medium: tasks.filter(t => t.priority === "Medium").length,
      Low: tasks.filter(t => t.priority === "Low").length,
    };
    renderBars("priority-bars", priorityCounts, (label) => `fill-${label.toLowerCase()}`);

    const categories = [...new Set(tasks.map(t => t.category || "Personal"))];
    const categoryCounts = {};
    categories.forEach(c => { categoryCounts[c] = tasks.filter(t => (t.category || "Personal") === c).length; });
    renderBars("category-bars", categoryCounts, "fill-cat");

    renderWeekChart(tasks);
  });
});