// Shared dark mode handler — include this script (as a regular <script>, not module) on EVERY page, before main.css visibly paints if possible.

(function () {
  const saved = localStorage.getItem("tma-theme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("tma-theme", theme);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(isDark ? "light" : "dark");
  return !isDark; // returns new isDark state
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

window.applyTheme = applyTheme;
window.toggleTheme = toggleTheme;
window.getTheme = getTheme;