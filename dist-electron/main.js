import { app as e, BrowserWindow as n } from "electron";
import i from "path";
import { fileURLToPath as a } from "url";
const l = a(import.meta.url), r = i.dirname(l), s = process.env.NODE_ENV === "development" || !e.isPackaged;
function t() {
  const o = new n({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0
    }
  });
  s ? (o.loadURL("http://localhost:5173"), o.webContents.openDevTools()) : o.loadFile(i.join(r, "../dist/index.html"));
}
e.whenReady().then(() => {
  t(), e.on("activate", () => {
    n.getAllWindows().length === 0 && t();
  });
});
e.on("window-all-closed", () => {
  process.platform !== "darwin" && e.quit();
});
