import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let allTasks = [];
let allSchedules = [];
let viewDate = new Date(); // any date within the currently viewed month
let selectedDate = new Date();

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function pad(n) { return n.toString().padStart(2, "0"); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function taskDeadlineKey(task) {
  if (!task.deadline) return null;
  const d = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
  return dateKey(d);
}

function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)}${ampm}`;
}

function buildDayMap() {
  const map = {}; // dateKey -> array of {title, colorClass, sub}

  allTasks.forEach(t => {
    const key = taskDeadlineKey(t);
    if (!key) return;
    if (!map[key]) map[key] = [];
    const pClass = t.priority === "High" ? "color-high" : t.priority === "Low" ? "color-low" : "color-medium";
    const d = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
    map[key].push({
      title: t.title,
      colorClass: pClass,
      sub: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
           " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      type: "task"
    });
  });

  allSchedules.forEach(s => {
    const key = s.date;
    if (!key) return;
    if (!map[key]) map[key] = [];
    const cClass = s.category === "Work" ? "color-work" : "color-personal";
    map[key].push({
      title: s.title,
      colorClass: cClass,
      sub: `${formatTime12(s.startTime)} - ${formatTime12(s.endTime)}`,
      type: "schedule"
    });
  });

  return map;
}

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  document.getElementById("month-label").textContent =
    viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dayMap = buildDayMap();

  let html = "";
  DAY_NAMES.forEach((d, i) => {
    html += `<div class="cal-head ${i === 0 || i === 6 ? 'weekend' : ''}">${d}</div>`;
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sun
  const gridStart = new Date(year, month, 1 - startOffset);

  const today = new Date();
  const todayKey = dateKey(today);
  const selKey = dateKey(selectedDate);

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const key = dateKey(cellDate);
    const inMonth = cellDate.getMonth() === month;
    const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
    const items = dayMap[key] || [];
    const visible = items.slice(0, 2);
    const extra = items.length - visible.length;

    html += `<div class="cal-day ${inMonth ? '' : 'other-month'} ${key === selKey ? 'selected' : ''}" data-date="${key}">
      <div class="day-num ${isWeekend ? 'weekend' : ''} ${key === todayKey ? 'is-today' : ''}">${cellDate.getDate()}</div>
      ${visible.map(it => `<div class="day-item ${it.colorClass}">${it.title}</div>`).join("")}
      ${extra > 0 ? `<div class="day-item more">+${extra} more</div>` : ""}
    </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll(".cal-day").forEach(cell => {
    cell.addEventListener("click", () => {
      const [y, m, d] = cell.dataset.date.split("-").map(Number);
      selectedDate = new Date(y, m - 1, d);
      renderCalendar();
      renderSidePanels();
    });
  });
}

function renderSidePanels() {
  const dayMap = buildDayMap();
  const key = dateKey(selectedDate);
  const items = dayMap[key] || [];

  document.getElementById("side-date-label").textContent =
    selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  document.getElementById("side-count-label").textContent = `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`;

  const sideList = document.getElementById("side-list");
  sideList.innerHTML = items.length
    ? items.map(it => `
      <div class="side-item">
        <span class="dot ${it.colorClass}"></span>
        <div>
          <div class="info-title">${it.title}</div>
          <div class="info-sub">${it.sub}</div>
        </div>
      </div>`).join("")
    : `<div class="side-empty">No items for this day</div>`;

  // Upcoming: next 7 days (excluding today), tasks only not yet completed
  const now = new Date();
  const in7 = new Date();
  in7.setDate(now.getDate() + 7);

  const upcoming = allTasks
    .filter(t => t.status !== "completed" && t.deadline)
    .map(t => ({ t, d: t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline) }))
    .filter(({ d }) => d > now && d <= in7)
    .sort((a, b) => a.d - b.d);

  document.getElementById("upcoming-count-label").textContent = `${upcoming.length} ${upcoming.length === 1 ? 'Task' : 'Tasks'}`;
  const upcomingList = document.getElementById("upcoming-list");
  upcomingList.innerHTML = upcoming.length
    ? upcoming.map(({ t, d }) => {
        const pClass = t.priority === "High" ? "color-high" : t.priority === "Low" ? "color-low" : "color-medium";
        return `<div class="side-item">
          <span class="dot ${pClass}"></span>
          <div>
            <div class="info-title">${t.title}</div>
            <div class="info-sub">${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
          </div>
        </div>`;
      }).join("")
    : `<div class="side-empty">No upcoming tasks</div>`;
}

document.getElementById("prev-month").addEventListener("click", () => {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
});

document.getElementById("today-btn").addEventListener("click", () => {
  viewDate = new Date();
  selectedDate = new Date();
  renderCalendar();
  renderSidePanels();
});

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.replace("auth.html"); return; }
  currentUser = user;

  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.replace("auth.html");
  });

  const tasksRef = collection(db, "users", user.uid, "tasks");
  onSnapshot(tasksRef, (snap) => {
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    renderSidePanels();
  });

  const schedulesRef = collection(db, "users", user.uid, "schedules");
  onSnapshot(schedulesRef, (snap) => {
    allSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    renderSidePanels();
  });
});