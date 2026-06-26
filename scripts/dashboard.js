import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "laban diha boss", author: "Archie A.K.A" },
];

let latestTasks = [];
let latestSchedules = [];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function pad(n) { return n.toString().padStart(2, "0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)}${ampm}`;
}

function isToday(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isUpcoming(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const in7 = new Date();
  in7.setDate(now.getDate() + 7);
  return d > now && d <= in7;
}

function scheduleDateObj(s) {
  // schedule.date is "YYYY-MM-DD", schedule.startTime is "HH:MM"
  const [y, m, d] = s.date.split("-").map(Number);
  const [h, min] = (s.startTime || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

function isScheduleToday(s) {
  const todayKey = dateKey(new Date());
  return s.date === todayKey;
}

function isScheduleUpcoming(s) {
  const d = scheduleDateObj(s);
  const now = new Date();
  const in7 = new Date();
  in7.setDate(now.getDate() + 7);
  return d > now && d <= in7;
}

function priorityBadge(p) {
  const cls = p === "High" ? "high" : p === "Medium" ? "medium" : "low";
  return `<span class="priority-badge ${cls}">${p}</span>`;
}

function categoryBadge(cat) {
  const cls = cat === "Work" ? "high" : "low"; // reuse existing badge color classes
  return `<span class="priority-badge ${cls}">${cat || "Personal"}</span>`;
}

function renderPanelItem(task) {
  return `<div class="panel-item">
    <div class="task-name">${task.title}</div>
    <div class="task-meta">${priorityBadge(task.priority)} &nbsp; ${formatDate(task.deadline)}</div>
  </div>`;
}

function formatScheduleDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function renderSchedulePanelItem(s) {
  return `<div class="panel-item">
    <div class="task-name">${s.title}</div>
    <div class="task-meta">${categoryBadge(s.category)} &nbsp; ${formatScheduleDate(s.date)} &nbsp; ${formatTime12(s.startTime)}${s.endTime ? " - " + formatTime12(s.endTime) : ""}</div>
  </div>`;
}

function renderPanels() {
  const tasks = latestTasks;
  const schedules = latestSchedules;

  // Today: tasks only (not completed, deadline today)
  const todayTasks = tasks.filter(t => t.status !== "completed" && isToday(t.deadline));
  const todayEl = document.getElementById("today-deadlines");
  todayEl.innerHTML = todayTasks.length
    ? todayTasks.map(renderPanelItem).join("")
    : `<p class="panel-empty">No deadlines today</p>`;

  // Upcoming: tasks only (not completed, deadline next 7 days)
  const upcomingTasks = tasks.filter(t => t.status !== "completed" && isUpcoming(t.deadline));
  const upcomingEl = document.getElementById("upcoming-deadlines");
  upcomingEl.innerHTML = upcomingTasks.length
    ? upcomingTasks.map(renderPanelItem).join("")
    : `<p class="panel-empty">No upcoming deadlines</p>`;

  // Recent activity (last 3 completed tasks only)
  const recent = tasks.filter(t => t.status === "completed").slice(0, 3);
  const recentEl = document.getElementById("recent-activity");
  recentEl.innerHTML = recent.length
    ? recent.map(renderPanelItem).join("")
    : `<p class="panel-empty">No recent activity</p>`;

  // Schedules panel: upcoming schedules (today + next 7 days), soonest first
  const upcomingSchedules = schedules
    .filter(s => isScheduleToday(s) || isScheduleUpcoming(s))
    .sort((a, b) => scheduleDateObj(a) - scheduleDateObj(b));
  const schedulesEl = document.getElementById("schedules-list");
  schedulesEl.innerHTML = upcomingSchedules.length
    ? upcomingSchedules.map(renderSchedulePanelItem).join("")
    : `<p class="panel-empty">No schedules yet</p>`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("auth.html");
    return;
  }

  // Greeting
  const greet = document.getElementById("greeting-text");
  greet.textContent = `${getGreeting()}, ${user.displayName || user.email.split("@")[0]}!`;

  // Random quote
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  document.getElementById("quote-text").innerHTML = `"${q.text}"<br><br>— ${q.author}`;

  // Logout
  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.replace("auth.html");
  });

  // Real-time tasks
  const tasksRef = collection(db, "users", user.uid, "tasks");
  const q2 = query(tasksRef, orderBy("createdAt", "desc"));

  onSnapshot(q2, (snap) => {
    latestTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const total     = latestTasks.length;
    const pending   = latestTasks.filter(t => t.status !== "completed").length;
    const completed = latestTasks.filter(t => t.status === "completed").length;
    const high      = latestTasks.filter(t => t.priority === "High" && t.status !== "completed").length;

    document.getElementById("total-tasks").textContent     = total;
    document.getElementById("pending-tasks").textContent   = pending;
    document.getElementById("completed-tasks").textContent = completed;
    document.getElementById("high-tasks").textContent      = high;

    renderPanels();
  });

  // Real-time schedules
  const schedulesRef = collection(db, "users", user.uid, "schedules");
  onSnapshot(schedulesRef, (snap) => {
    latestSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPanels();
  });
});