import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, query, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const START_HOUR = 7;  // 7:00 AM
const END_HOUR = 19;   // 7:00 PM (last row label)
const ROW_HEIGHT = 60; // px, must match .sched-row-line / .sched-time-cell height

let currentUser = null;
let allSchedules = [];
let weekStart = startOfWeek(new Date()); // Monday of current week

function pad(n) { return n.toString().padStart(2, "0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function schedulesRef() {
  return collection(db, "users", currentUser.uid, "schedules");
}

function scheduleDoc(id) {
  return doc(db, "users", currentUser.uid, "schedules", id);
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)}${ampm}`;
}

function renderWeekLabel() {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const label = `${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  document.getElementById("week-label").textContent = label;
}

function renderGrid() {
  const grid = document.getElementById("sched-grid");
  const numRows = END_HOUR - START_HOUR + 1;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  let html = `<div class="sched-time-head"></div>`;
  days.forEach((d, i) => {
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    html += `<div class="sched-day-head ${isWeekend ? 'weekend' : ''}">
      ${dayNames[i]}<br><span class="date-sub">${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
    </div>`;
  });

  // time column rows
  let timeColHtml = "";
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    timeColHtml += `<div class="sched-time-cell">${h12}:00 ${ampm}</div>`;
  }
  html += `<div>${timeColHtml}</div>`;

  // day columns with absolutely-positioned blocks
  days.forEach((d) => {
    const key = dateKey(d);
    const dayItems = allSchedules.filter(s => s.date === key);

    let rowLines = "";
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      rowLines += `<div class="sched-row-line"></div>`;
    }

    let blocksHtml = "";
    dayItems.forEach(s => {
      const startMin = timeToMinutes(s.startTime) - START_HOUR * 60;
      const endMin = s.endTime ? timeToMinutes(s.endTime) - START_HOUR * 60 : startMin + 60;
      const top = (startMin / 60) * ROW_HEIGHT;
      const height = Math.max(((endMin - startMin) / 60) * ROW_HEIGHT, 26);
      const colorClass = s.category === "Work" ? "color-work" : "color-personal";
      blocksHtml += `<div class="sched-block ${colorClass}" style="top:${top}px; height:${height}px;" data-id="${s.id}">
        <div>${s.title}</div>
        <div class="blk-time">${formatTime12(s.startTime)} - ${formatTime12(s.endTime)}</div>
      </div>`;
    });

    html += `<div class="sched-day-col">${rowLines}${blocksHtml}</div>`;
  });

  grid.innerHTML = html;
  grid.style.gridTemplateRows = `auto repeat(${numRows}, ${ROW_HEIGHT}px)`;

  grid.querySelectorAll(".sched-block").forEach(blockEl => {
    blockEl.addEventListener("click", () => {
      const id = blockEl.dataset.id;
      if (confirm("Delete this schedule?")) {
        deleteDoc(scheduleDoc(id));
      }
    });
  });
}

function render() {
  renderWeekLabel();
  renderGrid();
}

document.getElementById("prev-week").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() - 7);
  render();
});

document.getElementById("next-week").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() + 7);
  render();
});

document.getElementById("add-schedule-btn").addEventListener("click", () => {
  document.getElementById("s-title").value = "";
  document.getElementById("s-category").value = "Personal";
  document.getElementById("s-date").value = dateKey(new Date());
  document.getElementById("s-start").value = "09:00";
  document.getElementById("s-end").value = "10:00";
  document.getElementById("s-notes").value = "";
  document.getElementById("schedule-modal").classList.add("open");
});

document.getElementById("sched-cancel-btn").addEventListener("click", () => {
  document.getElementById("schedule-modal").classList.remove("open");
});

document.getElementById("schedule-modal").addEventListener("click", (e) => {
  if (e.target.id === "schedule-modal") {
    document.getElementById("schedule-modal").classList.remove("open");
  }
});

document.getElementById("sched-save-btn").addEventListener("click", async () => {
  try {
    const title = document.getElementById("s-title").value.trim();
    const category = document.getElementById("s-category").value;
    const date = document.getElementById("s-date").value;
    const startTime = document.getElementById("s-start").value;
    const endTime = document.getElementById("s-end").value;
    const notes = document.getElementById("s-notes").value.trim();

    if (!title) return alert("Please enter a schedule title.");
    if (!date) return alert("Please select a date.");
    if (!startTime) return alert("Please select a start time.");

    await addDoc(schedulesRef(), {
      title, category, date, startTime, endTime, notes,
      createdAt: serverTimestamp()
    });

    document.getElementById("schedule-modal").classList.remove("open");
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.replace("auth.html"); return; }
  currentUser = user;

  document.getElementById("logout-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.replace("auth.html");
  });

  const q = query(schedulesRef());
  onSnapshot(q, (snap) => {
    allSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, (error) => {
    console.error("Schedule snapshot error:", error);
  });
});
