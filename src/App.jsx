import { useState, useEffect, useRef } from "react";
import { CATS } from "./data.js";
import { loadState, saveState } from "./store.js";
import { tasksForDay, doneOn, computeNotifications, isDueOn, taskTime, taskTimes, toMin, ranked } from "./scheduler.js";
import { initNotifications, reschedule, testNotification, pokeNotification, isNative } from "./notifications.js";
import { cloudEnabled, subscribe, push as cloudPush } from "./cloud.js";

const uid = () => Math.random().toString(36).slice(2, 9);
const timeAgo = (ts) => {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return j === 1 ? "hier" : `il y a ${j} j`;
};
const FREQ_LABELS = {
  quotidien: "Quotidien", cycle: "Tous les X jours", hebdo: "Hebdomadaire",
  mensuel: "Mensuel", annuel: "Annuel", exceptionnel: "Exceptionnel",
};
const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(":");
  return +m ? `${+h}h${m}` : `${+h}h`;
};
const mondayOf = (d) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

// Messages de rappel bienveillants (tirés au sort)
const POKE_MSGS = [
  (n, t) => `${n}, un coup de main pour « ${t} » ? 🤝`,
  (n, t) => `Coucou ${n} ! « ${t} » t'attend quand tu peux 🌿`,
  (n, t) => `${n}, on compte sur toi pour « ${t} » — merci d'avance ! 💛`,
  (n, t) => `Petit rappel tout doux : « ${t} », quand ça t'arrange ${n} 🙂`,
  (n, t) => `${n}, « ${t} » n'attend que toi. Ensemble c'est plus léger ! ✨`,
];

// ─── Confettis 🎉 ───────────────────────────────────────────────────
function confetti() {
  const c = document.createElement("canvas");
  Object.assign(c.style, { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 300 });
  c.width = window.innerWidth; c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext("2d");
  const colors = ["#4caf6d", "#f2a93b", "#4a90d9", "#e06aa3", "#d94f4f", "#8b7bc7"];
  const parts = Array.from({ length: 90 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 140, y: c.height * 0.7,
    vx: (Math.random() - 0.5) * 13, vy: -7 - Math.random() * 10,
    r: 4 + Math.random() * 5, col: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (++frame < 95) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

function Avatar({ m, size = 36 }) {
  return m.photo ? (
    <img src={m.photo} alt={m.name} className="avatar"
      style={{ width: size, height: size, objectFit: "cover", background: m.color, border: `2px solid ${m.color}` }} />
  ) : (
    <span className="avatar" style={{ background: m.color, width: size, height: size, fontSize: size * 0.5 }}>{m.emoji}</span>
  );
}

// ─── Application ────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState("today");
  const [sync, setSync] = useState(cloudEnabled() ? "connexion…" : null);
  const pushTimer = useRef(null);
  const applyingRemote = useRef(false); // évite de renvoyer au cloud ce qu'on vient d'en recevoir
  const [toast, setToast] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [validating, setValidating] = useState(null); // tâche en attente de "qui l'a faite ?"
  const toastTimer = useRef(null);
  const { members, tasks, settings, history } = state;

  const patch = (p) => setState((s) => ({ ...s, ...p, rev: (s.rev ?? 0) + 1 }));

  // Fusionne un état distant avec l'état local SANS rien perdre :
  //  • l'historique = union des validations des deux appareils (clé = id unique)
  //  • tâches / réglages / membres = on prend la version la plus récemment modifiée
  const mergeRemote = (local, remote) => {
    const seen = new Set();
    const merged = [];
    for (const e of [...(local.history || []), ...(remote.history || [])]) {
      if (e && e.id && !seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }
    merged.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const remoteNewer = (remote.rev ?? 0) >= (local.rev ?? 0);
    const base = remoteNewer ? remote : local;
    return {
      ...local,
      members: base.members ?? local.members,
      tasks: base.tasks ?? local.tasks,
      settings: base.settings ?? local.settings,
      weekStart: base.weekStart ?? local.weekStart,
      history: merged,
      rev: Math.max(local.rev ?? 0, remote.rev ?? 0),
    };
  };

  useEffect(() => {
    saveState(state);
    if (isNative()) reschedule(computeNotifications(tasks, history, settings, members));
    if (cloudEnabled() && !applyingRemote.current) {
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        cloudPush(state)
          .then(() => setSync("à jour"))
          .catch(() => setSync("hors ligne"));
      }, 700);
    }
    applyingRemote.current = false;
  }, [state]);

  // Écoute des changements venus des autres téléphones du foyer
  useEffect(() => {
    if (!cloudEnabled()) return;
    let stop = () => {};
    subscribe(
      (remote) => {
        setState((s) => {
          const merged = mergeRemote(s, remote);
          // Rien de nouveau ? on évite un cycle inutile
          if (merged.history.length === (s.history || []).length &&
              (remote.rev ?? 0) <= (s.rev ?? 0)) return s;
          applyingRemote.current = true; // ce changement vient du cloud, ne pas le repush en boucle
          return merged;
        });
        setSync("à jour");
      },
      (st) => setSync(st)
    ).then((fn) => { stop = fn; });
    return () => stop();
  }, []);

  useEffect(() => {
    initNotifications();
    if (state.weekStart < mondayOf(new Date())) patch({ weekStart: mondayOf(new Date()) });
  }, []);

  const notify = (msg, undoIds) => {
    setToast({ msg, undoIds });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  // Validation : on demande toujours qui l'a faite
  const askWho = (task, mode = "done", occ = null) => setValidating({ task, mode, occ });
  const confirmWho = (task, ids, occ) => {
    const ts = Date.now();
    const entries = ids.map((mid) => ({ id: uid(), taskId: task.id, memberId: mid, pts: task.pts, ts, ...(occ ? { occ } : {}) }));
    patch({ history: [...history, ...entries] });
    setValidating(null);
    confetti();
    const names = ids.map((i) => members.find((m) => m.id === i)?.name).filter(Boolean).join(" et ");
    notify(`Bravo ${names} ! +${task.pts} pt${task.pts > 1 ? "s" : ""} chacun`, entries.map((e) => e.id));
  };
  const undo = (ids) => { patch({ history: history.filter((e) => !ids.includes(e.id)) }); setToast(null); };

  const saveTask = (t) => {
    if (t.id === "new") patch({ tasks: [...tasks, { ...t, id: uid() }] });
    else patch({ tasks: tasks.map((x) => (x.id === t.id ? t : x)) });
    setEditTask(null);
  };
  const deleteTask = (id) => { patch({ tasks: tasks.filter((t) => t.id !== id) }); setEditTask(null); };
  const setTaskTime = (id, time, silent) => {
    patch({ tasks: tasks.map((t) => (t.id === id ? { ...t, time, times: undefined } : t)) });
    if (!silent) notify(`Déplacé à ${fmtTime(time)} — et les jours suivants aussi`);
  };
  // Déplace UNE occurrence d'une tâche multi-horaires (remplace oldTime par newTime)
  const setTaskOccTime = (id, oldTime, newTime, silent) => {
    patch({
      tasks: tasks.map((t) => {
        if (t.id !== id) return t;
        const list = Array.isArray(t.times) && t.times.length ? [...t.times] : [t.time || oldTime];
        const i = list.indexOf(oldTime);
        if (i >= 0) list[i] = newTime; else list.push(newTime);
        const uniq = [...new Set(list)].sort();
        return uniq.length > 1 ? { ...t, times: uniq, time: undefined } : { ...t, time: uniq[0], times: undefined };
      }),
    });
    if (!silent) notify(`Déplacé à ${fmtTime(newTime)} — et les jours suivants aussi`);
  };
  const doPoke = (task, ids) => {
    const targets = members.filter((m) => ids.includes(m.id));
    for (const m of targets) {
      const msg = POKE_MSGS[Math.floor(Math.random() * POKE_MSGS.length)](m.name, task.name);
      pokeNotification(msg, task.kids);
    }
    setValidating(null);
    notify(`Rappel envoyé à ${targets.map((t) => t.name).join(" et ")} 🔔`);
  };

  const common = { members, tasks, settings, history, onEdit: setEditTask, askWho };

  // Barre d'onglets escamotable : elle s'efface pour libérer la page et
  // réapparaît dès qu'on redescend ou qu'on atteint le bas.
  const [barOpen, setBarOpen] = useState(true);
  const lastY = useRef(0);
  const idle = useRef(null);
  useEffect(() => {
    const scroller = document.scrollingElement || document.documentElement;
    const onScroll = () => {
      const y = scroller.scrollTop;
      const bottom = y + window.innerHeight >= scroller.scrollHeight - 30;
      const goingDown = y > lastY.current + 4;
      const goingUp = y < lastY.current - 4;
      if (goingDown || bottom) setBarOpen(true);
      else if (goingUp && y > 60) setBarOpen(false);
      lastY.current = y;
      clearTimeout(idle.current);
      idle.current = setTimeout(() => { if (scroller.scrollTop > 60 && !bottom) setBarOpen(false); }, 2600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(idle.current); };
  }, []);

  return (
    <>
      {tab === "today" && <Today {...common} />}
      {tab === "plan" && <Planning {...common} onAdd={() => setEditTask("new")} setTaskTime={setTaskTime} setTaskOccTime={setTaskOccTime} />}
      {tab === "scores" && (
        <Scores {...{ members, tasks, history }} weekStart={state.weekStart}
          onUndo={(id) => undo([id])}
          onNewWeek={() => { if (confirm("Repartir de zéro pour une nouvelle semaine ?")) { patch({ weekStart: Date.now() }); notify("Nouvelle semaine 🌞"); } }} />
      )}
      {tab === "settings" && <Settings {...{ members, settings, sync }} onChange={patch} notify={notify} />}

      <nav className={`tabs ${barOpen ? "" : "hidden"}`}>
        <button className="tabgrip" onClick={() => setBarOpen(!barOpen)} aria-label="Afficher ou masquer le menu" />
        {[["today", "🏠", "Aujourd'hui"], ["plan", "🗂️", "Planning"], ["scores", "🏆", "Scores"], ["settings", "⚙️", "Réglages"]].map(([k, ico, lb]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <span className="ico">{ico}</span>{lb}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.undoIds && <button onClick={() => undo(toast.undoIds)} style={{ background: "none", border: "none", color: "#ffd97a", fontWeight: 800 }}>Annuler</button>}
        </div>
      )}

      {validating && <WhoSheet task={validating.task} occ={validating.occ} initialMode={validating.mode} members={members} onConfirm={confirmWho} onNotify={doPoke} onClose={() => setValidating(null)} />}
      {editTask && (
        <TaskSheet task={editTask === "new" ? null : editTask} settings={settings} members={members}
          onSave={saveTask} onDelete={deleteTask} onClose={() => setEditTask(null)} />
      )}
    </>
  );
}

// ─── Panneau de validation : qui l'a faite ? / notifier un membre ───
function WhoSheet({ task, occ, initialMode = "done", members, onConfirm, onNotify, onClose }) {
  const [sel, setSel] = useState([]);
  const [mode, setMode] = useState(initialMode);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const switchTo = (m) => { setMode(m); setSel([]); };
  const cat = CATS[task.cat] || CATS.menage;
  const forWho = task.assignees?.length
    ? task.assignees.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(" et ")
    : null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>{cat.emoji} {task.name}</h3>

        <div className="segmented">
          <button className={mode === "done" ? "on" : ""} onClick={() => switchTo("done")}>
            ✓ Qui l'a faite ?
          </button>
          <button className={mode === "notify" ? "on notify" : ""} onClick={() => switchTo("notify")}>
            🔔 Notifier un membre
          </button>
        </div>

        <p className="sub">
          {mode === "done"
            ? `Coche-toi, et ajoute ceux qui t'ont aidé — chacun gagne ${task.pts} pt${task.pts > 1 ? "s" : ""}.`
            : "À qui envoyer un rappel bienveillant pour cette tâche ?"}
          {forWho ? ` Cette tâche est prévue pour ${forWho}.` : ""}
        </p>

        <div className="whogrid">
          {members.filter((m) => m.role !== "bebe").map((m) => {
            const on = sel.includes(m.id);
            return (
              <button key={m.id} className={`whobtn ${on ? "on" : ""}`} style={on ? { borderColor: m.color, background: m.color + "1f" } : {}}
                onClick={() => toggle(m.id)}>
                <Avatar m={m} size={52} />
                <span>{m.name}</span>
                <span className="check" style={{ background: on ? m.color : "#dfe6ea" }}>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>

        <button className="btn" disabled={!sel.length}
          style={{ width: "100%", marginTop: 16, opacity: sel.length ? 1 : 0.4, background: mode === "done" ? cat.color : "#F2A93B" }}
          onClick={() => (mode === "done" ? onConfirm(task, sel, occ) : onNotify(task, sel))}>
          {mode === "done"
            ? `✓ Valider${sel.length > 1 ? ` pour ${sel.length} personnes` : ""}`
            : `🔔 Envoyer le rappel${sel.length > 1 ? ` à ${sel.length} personnes` : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── Aujourd'hui ────────────────────────────────────────────────────
function Today({ members, tasks, settings, history, onEdit, askWho }) {
  const [detail, setDetail] = useState(null);
  const today = new Date();
  const groups = tasksForDay(tasks, history, today, settings);
  const slotDefs = { ...settings.slots, autre: { label: "Aussi aujourd'hui", time: "", emoji: "📌" } };
  const dateStr = today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const nowMin = today.getHours() * 60 + today.getMinutes();

  const flat = Object.values(groups).flat();
  const total = flat.length;
  const done = flat.filter((t) => doneOn(t, history, today, t.occ || taskTime(t, settings))).length;

  return (
    <>
      <h1>Le tableau du foyer 🏡</h1>
      <p className="sub">{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · {done}/{total} fait{done > 1 ? "s" : ""}</p>

      {total > 0 && (
        <div className="progress"><span style={{ width: `${(done / total) * 100}%` }} /></div>
      )}

      {Object.entries(slotDefs).map(([k, slot]) => {
        const list = groups[k] || [];
        if (!list.length) return null;
        return (
          <section key={k}>
            <h2>{slot.emoji} {slot.label}</h2>
            {list.map((t) => {
              const occ = t.occ || taskTime(t, settings);
              const isDone = doneOn(t, history, today, occ);
              const cat = CATS[t.cat] || CATS.menage;
              const late = !isDone && toMin(occ) < nowMin;
              return (
                <div key={t.id + "@" + occ} className={`tcard ${t.kids ? "kids" : ""}`} style={{ borderLeft: `5px solid ${cat.color}` }}>
                  {t.kids && <span className="tl-kid" />}
                  <button className="cardbtn" onClick={() => setDetail({ ...t, occ })}>
                    <b style={{ fontSize: 12.5, opacity: 0.65, minWidth: 40 }}>{fmtTime(occ)}</b>
                    <span className={isDone ? "done" : ""} style={{ flex: 1 }}>{cat.emoji} {t.name}</span>
                    {(t.assignees || []).map((id) => {
                      const m = members.find((x) => x.id === id);
                      return m && <span key={id} className="badge" style={{ background: m.color, color: "#fff" }}>{m.emoji} {m.name}</span>;
                    })}
                    {late && <span className="badge" style={{ background: "#fff4e0", color: "#b57314" }}>en attente</span>}
                  </button>
                  {isDone ? (
                    <span className="badge" style={{ background: "#e3f4e9", color: "#2e7d4f" }}>✓ Fait</span>
                  ) : (
                    <button className="btn" style={{ background: cat.color, padding: "7px 12px", fontSize: 13 }} onClick={() => askWho(t, "done", occ)}>✓ Fait</button>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {!total && <p className="sub" style={{ marginTop: 30, textAlign: "center" }}>Rien à faire aujourd'hui. Profitez ! 🏖️</p>}

      {detail && (
        <div className="sheet-bg" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 800 }}>
              {(CATS[detail.cat] || CATS.menage).emoji} {detail.name}
            </h3>
            <p className="sub">
              Prévu à {fmtTime(detail.occ || taskTime(detail, settings))} · {detail.pts} pt{detail.pts > 1 ? "s" : ""}
              {detail.kids ? " · 🟢 faisable par les enfants" : ""}
            </p>
            <div className="actions">
              {!doneOn(detail, history, today, detail.occ) && (
                <button className="btn" style={{ background: (CATS[detail.cat] || CATS.menage).color }}
                  onClick={() => { askWho(detail, "done", detail.occ); setDetail(null); }}>✓ C'est fait</button>
              )}
              <button className="btn notifybtn" onClick={() => { askWho(detail, "notify", detail.occ); setDetail(null); }}>
                🔔 Notifier un membre
              </button>
              <button className="btn ghostfull" onClick={() => { onEdit(detail); setDetail(null); }}>Modifier la fiche</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 20 }} />
    </>
  );
}

// ─── Planning : frise + bibliothèque ────────────────────────────────
function Planning({ tasks, settings, members, history, onEdit, onAdd, askWho, setTaskTime, setTaskOccTime }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState({});
  const [quick, setQuick] = useState(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const wrapRef = useRef(null);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const day = new Date();
  day.setDate(day.getDate() + offset);
  const isToday = offset === 0;

  const HSTART = 6, HEND = 23, PPH = 62, ROWH = 32, HEAD = 52;
  const PERIODS = [
    { label: "Matin", from: 6, to: 12, color: "#7cb342" },
    { label: "Midi", from: 12, to: 17, color: "#ab47bc" },
    { label: "Soir", from: 17, to: 21, color: "#f2a93b" },
    { label: "Coucher", from: 21, to: 23, color: "#3f51b5" },
  ];
  const perColor = (h) => (PERIODS.find((p) => h >= p.from && h < p.to) || PERIODS[PERIODS.length - 1]).color;
  const xToTime = (x) => {
    let mins = Math.round(((x / PPH) + HSTART) * 60 / 15) * 15;
    mins = Math.max(HSTART * 60, Math.min(HEND * 60, mins));
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  };

  // Une tâche peut avoir plusieurs horaires → une occurrence par heure.
  // Pendant un glissement, seule l'occurrence tirée suit le doigt.
  const due = tasks
    .filter((t) => t.freq !== "exceptionnel" && isDueOn(t, history, day, settings))
    .flatMap((t) =>
      taskTimes(t, settings).map((baseTime) => {
        const dragging = drag?.taskId === t.id && drag?.occ === baseTime;
        const time = dragging ? drag.time : baseTime;
        const [h, m] = time.split(":").map(Number);
        return { t, occ: baseTime, time, h, m, x: (h + m / 60 - HSTART) * PPH };
      })
    )
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));

  // Empilement : chaque étiquette prend une ligne libre s'il y a collision.
  // Deux tâches à la même heure — ou proches — se placent l'une sous l'autre.
  const LMAX = 230;
  const estWidth = (t) => Math.min(LMAX, 62 + (t.kids ? 16 : 0) + t.name.length * 6.6);
  const rowEnds = [];
  for (const e of due) {
    e.w = estWidth(e.t);
    let r = 0;
    while (r < rowEnds.length && rowEnds[r] > e.x - 8) r++;
    e.row = r;
    rowEnds[r] = e.x + e.w;
  }
  const maxRow = Math.max(0, ...due.map((e) => e.row));
  const tlWidth = (HEND - HSTART) * PPH + 70;
  const tlHeight = HEAD + (maxRow + 1) * ROWH + 6;
  const now = new Date();
  const nowX = (now.getHours() + now.getMinutes() / 60 - HSTART) * PPH;

  // ── Glisser une tâche pour changer son heure (uniquement horizontal) ──
  // Le déplacement suit le doigt SANS faire défiler la frise : la frise
  // reste fixe, seul l'ascenseur du bas navigue dans la journée.
  const down = (e, item) => {
    const rect = wrapRef.current.getBoundingClientRect();
    dragRef.current = {
      taskId: item.t.id, occ: item.occ, startX: e.clientX, moved: false,
      originX: item.x, wrapLeft: rect.left, scroll: wrapRef.current.scrollLeft,
      time: item.time, task: item.t,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) { d.moved = true; navigator.vibrate?.(12); }
    // on tient compte du défilement courant de la frise pour rester juste
    const scrolled = wrapRef.current ? wrapRef.current.scrollLeft - d.scroll : 0;
    d.time = xToTime(d.originX + dx + scrolled);
    setDrag({ taskId: d.taskId, occ: d.occ, time: d.time });
  };
  const justDragged = useRef(0);
  const up = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.moved) {
      justDragged.current = Date.now();
      if (d.time !== d.occ) setTaskOccTime(d.taskId, d.occ, d.time);
    }
  };

  // ── Ascenseur : pilote le défilement de la frise ──────────────────
  const [scrollFrac, setScrollFrac] = useState(0);
  const syncSlider = () => {
    const w = wrapRef.current;
    if (!w) return;
    const max = w.scrollWidth - w.clientWidth;
    setScrollFrac(max > 0 ? w.scrollLeft / max : 0);
  };
  const onSlider = (e) => {
    const w = wrapRef.current;
    if (!w) return;
    const frac = Number(e.target.value) / 1000;
    const max = w.scrollWidth - w.clientWidth;
    w.scrollLeft = frac * max;
    setScrollFrac(frac);
  };
  // Le tap passe par un vrai clic : fiable sur tous les téléphones,
  // même si le navigateur interrompt le geste (scroll, pointercancel…).
  const tapTask = (task) => {
    if (Date.now() - justDragged.current < 400) return;
    setQuick(task);
  };

  const who = (t) => (t.assignees || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const freqInfo = (t) => {
    if (t.freq === "quotidien") return `chaque jour · ${fmtTime(taskTime(t, settings))}`;
    if (t.freq === "cycle") return `tous les ${t.cycleDays} j · ${fmtTime(taskTime(t, settings))}`;
    if (t.freq === "hebdo") return `${WEEKDAYS[t.weekDay ?? settings.hebdo.day]} · ${fmtTime(taskTime(t, settings))}`;
    if (t.freq === "mensuel") return `le ${t.monthDay ?? (t.paiement ? settings.paiements.day : settings.mensuel.day)}`;
    if (t.freq === "annuel") return t.date ? t.date.split("-").reverse().join("/") : "";
    return "à l'occasion";
  };

  const Row = ({ t }) => {
    const cat = CATS[t.cat] || CATS.menage;
    return (
      <button className={`tcard ${t.kids ? "kids" : ""}`} style={{ width: "100%", border: "none", borderLeft: `5px solid ${cat.color}`, textAlign: "left" }}
        onClick={() => onEdit(t)}>
        {t.kids && <span className="tl-kid" />}
        <span style={{ flex: 1 }}>{cat.emoji} {t.name}</span>
        {who(t).map((m) => <span key={m.id} className="badge" style={{ background: m.color, color: "#fff" }}>{m.emoji}</span>)}
        <span className="badge" style={{ background: "#edf1f4" }}>{freqInfo(t)}</span>
      </button>
    );
  };

  return (
    <>
      <h1>Planning 🗂️</h1>

      <h2>Plan de la journée</h2>
      <div className="daynav">
        <button className="navbtn" disabled={offset <= -1} onClick={() => setOffset(offset - 1)}>&#8592;</button>
        <span className="navlabel">
          {isToday ? "Aujourd'hui" : offset === 1 ? "Demain" : offset === -1 ? "Hier"
            : day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
        </span>
        <button className="navbtn" disabled={offset >= 7} onClick={() => setOffset(offset + 1)}>&#8594;</button>
      </div>

      <div className="tl-wrap noscroll" ref={wrapRef} onScroll={syncSlider}>
        <div className="tl-inner" style={{ width: tlWidth, height: tlHeight }}>
          {PERIODS.map((p) => (
            <span key={p.label}>
              <div className="tl-period" style={{ left: (p.from - HSTART) * PPH, width: (p.to - p.from) * PPH, color: p.color }}>{p.label}</div>
              <div className="tl-vline strong" style={{ left: (p.from - HSTART) * PPH, background: p.color }} />
            </span>
          ))}
          {Array.from({ length: HEND - HSTART + 1 }, (_, i) => HSTART + i).map((h) => (
            <span key={h}>
              <div className="tl-hour" style={{ left: (h - HSTART) * PPH, color: perColor(h) }}>{h}h</div>
              <div className="tl-vline" style={{ left: (h - HSTART) * PPH }} />
            </span>
          ))}
          {isToday && nowX > 0 && nowX < tlWidth && <div className="tl-now" style={{ left: nowX }} />}
          {due.map((item) => {
            const { t, h, m, x, row, occ } = item;
            const cat = CATS[t.cat] || CATS.menage;
            const isDone = isToday && doneOn(t, history, day, occ);
            const dragging = drag?.taskId === t.id && drag?.occ === occ;
            return (
              <button key={t.id + "@" + occ} className={`tl-task ${isDone ? "tl-done" : ""} ${dragging ? "tl-drag" : ""}`}
                style={{ left: x, top: HEAD + row * ROWH, maxWidth: LMAX }}
                onPointerDown={(e) => down(e, item)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onClick={() => tapTask(t)}>
                <span className="tl-tick" style={{ background: cat.color }} />
                {t.kids && <span className="tl-kid" />}
                <b>{m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`}</b>
                <span className="tl-name" style={{ color: cat.color }}>{t.name}</span>
                {isDone && <span>✓</span>}
              </button>
            );
          })}
          {!due.length && <div style={{ position: "absolute", top: HEAD + 4, left: 12, fontSize: 13, opacity: 0.6 }}>Rien de prévu ce jour-là 🏖️</div>}
        </div>
      </div>

      <input className="tl-slider" type="range" min="0" max="1000" value={Math.round(scrollFrac * 1000)}
        onChange={onSlider} aria-label="Faire défiler la journée" />
      <p className="sub">Fais coulisser la barre ci-dessus pour parcourir la journée. Dans la frise, glisse une tâche pour changer son heure ; touche-la pour ouvrir le détail.</p>

      <h2 style={{ marginTop: 22 }}>Bibliothèque des fiches</h2>
      <p className="sub">Tout le stock est rangé ici, replié.</p>
      {Object.entries(FREQ_LABELS).map(([f, lbl]) => {
        const list = tasks.filter((t) => t.freq === f);
        if (!list.length) return null;
        const cats = [...new Set(list.map((t) => t.cat))];
        return (
          <div className="acc" key={f}>
            <button className="acc-head" onClick={() => toggle(f)}>
              <span className={`caret ${open[f] ? "open" : ""}`} /> {lbl}
              <span className="count">{list.length}</span>
            </button>
            {open[f] && (
              <div className="acc-sub">
                {cats.map((c) => {
                  const cat = CATS[c] || CATS.menage;
                  const sub = list.filter((t) => t.cat === c);
                  const k = f + ":" + c;
                  return (
                    <div key={c}>
                      <button className="acc-cat" onClick={() => toggle(k)}>
                        <span className={`caret ${open[k] ? "open" : ""}`} />
                        <span style={{ flex: 1 }}>{cat.emoji} {cat.label}</span>
                        <span className="count">{sub.length}</span>
                      </button>
                      {open[k] && sub.map((t) => <Row key={t.id} t={t} />)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ height: 80 }} />
      <button className="fab" onClick={onAdd}>+ Nouvelle tâche</button>

      {quick && (
        <div className="sheet-bg" onClick={() => setQuick(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 800 }}>
              {(CATS[quick.cat] || CATS.menage).emoji} {quick.name}
            </h3>
            <p className="sub">{freqInfo(quick)} · {quick.pts} pt{quick.pts > 1 ? "s" : ""}{quick.kids ? " · 🟢 faisable par les enfants" : ""}</p>
            <label className="lbl">Heure sur le planning</label>
            <input className="inp" type="time" value={taskTime(quick, settings)}
              onChange={(e) => { setTaskTime(quick.id, e.target.value, true); setQuick({ ...quick, time: e.target.value }); }} />
            <div className="actions">
              {isToday && !doneOn(quick, history, day) && (
                <button className="btn" style={{ background: (CATS[quick.cat] || CATS.menage).color }}
                  onClick={() => { askWho(quick, "done"); setQuick(null); }}>✓ C'est fait</button>
              )}
              <button className="btn notifybtn" onClick={() => { askWho(quick, "notify"); setQuick(null); }}>
                🔔 Notifier un membre
              </button>
              <button className="btn ghostfull" onClick={() => { onEdit(quick); setQuick(null); }}>Modifier la fiche</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Fiche d'édition ────────────────────────────────────────────────
function TaskSheet({ task, settings, members, onSave, onDelete, onClose }) {
  const [t, setT] = useState(task || {
    id: "new", name: "", cat: "menage", freq: "quotidien", slot: "soir", time: "19:30", pts: 2, kids: false, cycleDays: 4,
  });
  const set = (p) => setT((x) => ({ ...x, ...p }));

  // Liste des horaires en cours d'édition (au moins un)
  const times = (Array.isArray(t.times) && t.times.length ? t.times : [t.time || taskTime(t, settings)]);
  const commitTimes = (list) => {
    const uniq = [...new Set(list.filter(Boolean))].sort();
    if (uniq.length <= 1) set({ time: uniq[0] || "19:30", times: undefined });
    else set({ times: uniq, time: undefined });
  };
  const setTimeAt = (i, v) => { const l = [...times]; l[i] = v; commitTimes(l); };
  const addTime = () => commitTimes([...times, "12:00"]);
  const removeTimeAt = (i) => commitTimes(times.filter((_, j) => j !== i));

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{task ? "Modifier la fiche" : "Nouvelle tâche"}</h3>
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>

        <label className="lbl">Nom</label>
        <input className="inp" value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Laver la voiture" />

        <label className="lbl">Catégorie</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {Object.entries(CATS).map(([k, c]) => (
            <button key={k} className={`chip ${t.cat === k ? "on" : ""}`} style={t.cat === k ? { background: c.color } : {}}
              onClick={() => set({ cat: k })}>{c.emoji} {c.label}</button>
          ))}
        </div>

        <label className="lbl">Fréquence</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {Object.entries(FREQ_LABELS).map(([k, lbl]) => (
            <button key={k} className={`chip ${t.freq === k ? "on" : ""}`} style={t.freq === k ? { background: "var(--ink)" } : {}}
              onClick={() => set({ freq: k })}>{lbl}</button>
          ))}
        </div>

        {t.freq === "cycle" && (
          <>
            <label className="lbl">Tous les {t.cycleDays} jours (depuis la dernière validation)</label>
            <input type="range" min="2" max="30" value={t.cycleDays} onChange={(e) => set({ cycleDays: +e.target.value })} style={{ width: "100%" }} />
          </>
        )}
        {t.freq === "hebdo" && (
          <>
            <label className="lbl">Jour de la semaine</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {WEEKDAYS.map((d, i) => (
                <button key={d} className={`chip ${(t.weekDay ?? settings.hebdo.day) === i ? "on" : ""}`}
                  style={(t.weekDay ?? settings.hebdo.day) === i ? { background: "var(--ink)" } : {}}
                  onClick={() => set({ weekDay: i })}>{d}</button>
              ))}
            </div>
          </>
        )}
        {t.freq === "mensuel" && (
          <>
            <label className="lbl">Jour du mois (1–28)</label>
            <input className="inp" type="number" min="1" max="28" value={t.monthDay ?? (t.paiement ? settings.paiements.day : settings.mensuel.day)}
              onChange={(e) => set({ monthDay: +e.target.value })} />
          </>
        )}
        {t.freq === "annuel" && (
          <>
            <label className="lbl">Date (rappels J-30 et J-7 automatiques)</label>
            <input className="inp" type="date" value={t.date ? `2026-${t.date}` : ""} onChange={(e) => set({ date: e.target.value.slice(5) })} />
          </>
        )}
        {t.freq !== "exceptionnel" && t.freq !== "annuel" && (
          <>
            <label className="lbl">Heure(s) sur le planning</label>
            {times.map((tm, i) => (
              <div className="timerow" key={i}>
                <input className="inp" type="time" value={tm} onChange={(e) => setTimeAt(i, e.target.value)} />
                {times.length > 1 && (
                  <button className="timedel" onClick={() => removeTimeAt(i)} title="Retirer cette heure">✕</button>
                )}
              </div>
            ))}
            <button className="timeadd" onClick={addTime}>+ Ajouter une heure</button>
            {times.length > 1 && (
              <p className="sub" style={{ marginTop: 6 }}>
                Cette tâche apparaîtra {times.length} fois dans la journée, à chacune de ces heures.
              </p>
            )}
          </>
        )}

        <label className="lbl">Points ({t.pts})</label>
        <input type="range" min="0" max="5" value={t.pts} onChange={(e) => set({ pts: +e.target.value })} style={{ width: "100%" }} />

        <label className="lbl">Attribuée à — aucune sélection = tout le monde</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {members.filter((m) => m.role !== "bebe").map((m) => {
            const on = (t.assignees || []).includes(m.id);
            return (
              <button key={m.id} className={`chip ${on ? "on" : ""}`} style={on ? { background: m.color } : {}}
                onClick={() => set({ assignees: on ? t.assignees.filter((x) => x !== m.id) : [...(t.assignees || []), m.id] })}>
                {m.emoji} {m.name}
              </button>
            );
          })}
        </div>

        <button className={`chip ${t.kids ? "on" : ""}`} style={{ marginTop: 14, width: "100%", padding: "11px", background: t.kids ? "var(--green)" : "#edf1f4" }}
          onClick={() => set({ kids: !t.kids })}>
          🟢 Faisable par les enfants {t.kids ? "— oui (notif verte)" : "— non"}
        </button>

        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          {task && <button className="btn danger" onClick={() => confirm("Supprimer cette fiche ?") && onDelete(t.id)}>Supprimer</button>}
          <button className="btn" style={{ flex: 1, opacity: t.name.trim() ? 1 : 0.4 }} disabled={!t.name.trim()} onClick={() => onSave(t)}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Scores (podium avec ex æquo) ───────────────────────────────────
function Scores({ members, tasks, history, weekStart, onUndo, onNewWeek }) {
  const week = history.filter((e) => e.ts >= weekStart);
  const scores = ranked(members, history, weekStart);
  const max = Math.max(1, ...scores.map((s) => s.total));
  const hasPoints = scores.some((s) => s.total > 0);

  // groupes de rang : les ex æquo partagent la même marche
  const byRank = [];
  for (const s of scores) {
    if (s.rank > 2) break;
    (byRank[s.rank] ??= []).push(s);
  }
  const steps = [1, 0, 2].filter((r) => byRank[r]?.length);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Scores 🏆</h1>
        <button className="btn ghost" onClick={onNewWeek}>Nouvelle semaine</button>
      </div>
      <p className="sub">Depuis le {new Date(weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>

      {hasPoints && (
        <div className="podium">
          {steps.map((r) => (
            <div className="step" key={r} style={{ flex: byRank[r].length }}>
              <div className="row" style={{ gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                {byRank[r].map((m) => <Avatar key={m.id} m={m} size={r === 0 ? 62 : 48} />)}
              </div>
              <div className="pname">{medals[r]} {byRank[r].map((m) => m.name).join(" & ")}</div>
              <div className="pblock" style={{ height: [92, 62, 42][r], background: byRank[r][0].color }}>
                {byRank[r].length > 1 ? "ex æquo" : ["1er", "2e", "3e"][r]}<br /><b>{byRank[r][0].total} pts</b>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {scores.map((m) => (
          <div key={m.id} className="row" style={{ padding: "6px 0" }}>
            <Avatar m={m} />
            <span style={{ flex: 1 }}>
              <b>{m.name}</b> {m.rank < 3 && m.total > 0 && medals[m.rank]}
              <span style={{ display: "block", height: 6, background: "#edf1f4", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(m.total / max) * 100}%`, background: m.color, borderRadius: 3, transition: "width .4s" }} />
              </span>
            </span>
            <b style={{ color: m.color, fontVariantNumeric: "tabular-nums" }}>{m.total} pts</b>
          </div>
        ))}
      </div>

      <h2>Journal</h2>
      {[...week].reverse().slice(0, 20).map((e) => {
        const m = members.find((x) => x.id === e.memberId);
        const t = tasks.find((x) => x.id === e.taskId);
        return (
          <div key={e.id} className="tcard" style={{ borderLeft: `5px solid ${m?.color ?? "#ccc"}` }}>
            <span style={{ flex: 1, fontSize: 13 }}>
              {m?.emoji} <b>{m?.name}</b> · {t?.name ?? "tâche supprimée"} <span style={{ opacity: 0.5 }}>· {timeAgo(e.ts)}</span>
            </span>
            <b>+{e.pts}</b>
            <button className="undobtn" onClick={() => onUndo(e.id)}>Annuler</button>
          </div>
        );
      })}
      {!week.length && <p className="sub">Aucune tâche validée pour l'instant cette semaine.</p>}
      <div style={{ height: 20 }} />
    </>
  );
}

// ─── Réglages ───────────────────────────────────────────────────────
function Settings({ members, settings, sync, onChange, notify }) {
  const fileRef = useRef(null);
  const photoFor = useRef(null);

  const pickPhoto = (id) => { photoFor.current = id; fileRef.current?.click(); };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photoFor.current) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = 160; c.width = s; c.height = s;
      const min = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
      onChange({ members: members.map((m) => (m.id === photoFor.current ? { ...m, photo: c.toDataURL("image/jpeg", 0.82) } : m)) });
      URL.revokeObjectURL(url);
      notify("Photo enregistrée");
    };
    img.src = url;
  };
  const removePhoto = (id) => onChange({ members: members.map((m) => (m.id === id ? { ...m, photo: undefined } : m)) });
  const set = (p) => onChange({ settings: { ...settings, ...p } });
  const cps = settings.checkpoints || [];
  const setCp = (i, v) => set({ checkpoints: cps.map((c, j) => (j === i ? v : c)) });

  const Line = ({ label, children }) => (
    <div className="setline">
      <span className="setlabel">{label}</span>
      <span className="setctrl">{children}</span>
    </div>
  );

  return (
    <>
      <h1>Réglages</h1>

      <h2>Le foyer</h2>
      <div className="card">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        {members.map((m) => (
          <div key={m.id} className="memrow">
            <Avatar m={m} size={42} />
            <span className="meminfo">
              <b>{m.name}</b>
              <small>{m.role === "parent" ? "Parent" : m.role === "bebe" ? "Bébé" : "Enfant"}
                {m.birth ? ` · né le ${m.birth.split("-").reverse().join("/")}` : ""}</small>
            </span>
            <button className="photobtn" onClick={() => (m.photo ? removePhoto(m.id) : pickPhoto(m.id))}>
              {m.photo ? "Retirer" : "📷 Photo"}
            </button>
          </div>
        ))}
        <p className="sub" style={{ margin: "10px 0 0" }}>Mélisse et Syrah (chiens) · les tortues</p>
      </div>

      <h2>Points de contrôle</h2>
      <p className="sub">À chaque heure, l'appli signale ce qui devait être fait avant et n'est pas encore validé. Le retard de la veille n'est jamais rappelé.</p>
      <div className="card">
        {cps.map((c, i) => (
          <div key={i} className="setline">
            <span className="setlabel">Contrôle {i + 1}</span>
            <span className="setctrl">
              <input className="inp time" type="time" value={c} onChange={(e) => setCp(i, e.target.value)} />
              <button className="iconbtn" title="Supprimer ce contrôle"
                onClick={() => set({ checkpoints: cps.filter((_, j) => j !== i) })}>Retirer</button>
            </span>
          </div>
        ))}
        <button className="btn addbtn" onClick={() => set({ checkpoints: [...cps, "12:00"] })}>
          + Ajouter un contrôle
        </button>
      </div>

      <h2>Créneaux par défaut et échéances</h2>
      <div className="card">
        {Object.entries(settings.slots).map(([k, s]) => (
          <Line key={k} label={s.label}>
            <input className="inp time" type="time" value={s.time}
              onChange={(e) => set({ slots: { ...settings.slots, [k]: { ...s, time: e.target.value } } })} />
          </Line>
        ))}
        <Line label="Tâches hebdomadaires">
          <select className="inp sel" value={settings.hebdo.day} onChange={(e) => set({ hebdo: { ...settings.hebdo, day: +e.target.value } })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input className="inp time" type="time" value={settings.hebdo.time} onChange={(e) => set({ hebdo: { ...settings.hebdo, time: e.target.value } })} />
        </Line>
        <Line label="Ménage mensuel : le">
          <input className="inp num" type="number" min="1" max="28" value={settings.mensuel.day} onChange={(e) => set({ mensuel: { ...settings.mensuel, day: +e.target.value } })} />
        </Line>
        <Line label="Paiements : le">
          <input className="inp num" type="number" min="1" max="28" value={settings.paiements.day} onChange={(e) => set({ paiements: { ...settings.paiements, day: +e.target.value } })} />
        </Line>
        <Line label={`Podium : ${WEEKDAYS[settings.podium?.day ?? 0]}`}>
          <input className="inp time" type="time" value={settings.podium?.time ?? "19:00"}
            onChange={(e) => set({ podium: { ...(settings.podium || { day: 0 }), time: e.target.value } })} />
        </Line>
      </div>

      <h2>Partage entre les téléphones</h2>
      <div className="card">
        {sync === null ? (
          <p className="sub" style={{ margin: 0 }}>
            La synchronisation n'est pas encore activée : les données restent sur ce téléphone.
          </p>
        ) : (
          <div className="setline" style={{ borderBottom: "none" }}>
            <span className="setlabel">État du carnet partagé</span>
            <span className="badge" style={{ background: sync === "erreur" ? "#fbe9e9" : "#e3f4e9", color: sync === "erreur" ? "#c0392b" : "#2e7d4f" }}>
              {sync}
            </span>
          </div>
        )}
      </div>

      <h2>Notifications</h2>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => testNotification(false)}>Tester famille</button>
        <button className="btn" style={{ flex: 1, background: "var(--green)" }} onClick={() => testNotification(true)}>Tester enfants</button>
      </div>
      <p className="sub" style={{ marginTop: 10 }}>
        Les rappels sont recalculés à chaque ouverture de l'appli et à chaque validation.
        Pour l'instant les données restent sur cet appareil : un rappel envoyé à un membre
        s'affiche donc sur ce téléphone. La synchronisation entre les téléphones viendra
        dans une prochaine étape.
      </p>
      <div style={{ height: 20 }} />
    </>
  );
}
