// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" }) // dili na i-cache sa browser ang sw.js mismo
      .then((reg) => {
        // Check dayon kung naa bag-ong version, ug i-recheck kada balik active ang tab
        reg.update();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });

        // Pag naa bag-ong SW nga "installed" na pero naghulat pa,
        // pugson dayon mag-activate (skipWaiting already auto-runs sa sw.js,
        // pero ni ang explicit nudge gikan sa page side)
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});
  });

  // Pag nag-activate na ang bag-ong SW (gi-claim na ang tab),
  // i-reload dayon ang page — mao ni ang "auto refresh" nga gusto nimo.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// Install prompt
let deferredPrompt;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true; // iOS Safari
}

function showInstallBtn(show) {
  document.querySelectorAll("#install-btn").forEach(btn => {
    btn.style.display = show ? "flex" : "none";
  });
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone()) showInstallBtn(true);
});

window.installApp = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  showInstallBtn(false);
};

window.addEventListener("appinstalled", () => {
  console.log("TMAPP installed!");
  showInstallBtn(false);
});