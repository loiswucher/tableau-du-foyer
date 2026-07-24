// ─── Planification des tâches et des rappels ────────────────────────

export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function atTime(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Dernière validation d'une tâche (timestamp) ou null */
export function lastDone(task, history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].taskId === task.id) return history[i].ts;
  }
  return null;
}

/** La tâche a-t-elle été validée le jour donné ? */
export function doneOn(task, history, date) {
  const k = dayKey(date);
  return history.some((e) => e.taskId === task.id && dayKey(e.ts) === k);
}

/** La tâche est-elle due le jour donné ? */
export function isDueOn(task, history, date, settings) {
  const d = new Date(date);
  switch (task.freq) {
    case "quotidien":
      return true;
    case "hebdo": {
      const wd = task.weekDay ?? settings.hebdo.day;
      return d.getDay() === wd;
    }
    case "mensuel": {
      const md = task.monthDay ?? (task.paiement ? settings.paiements.day : settings.mensuel.day);
      return d.getDate() === md;
    }
    case "annuel": {
      if (!task.date) return false;
      const [mm, jj] = task.date.split("-").map(Number);
      return d.getMonth() + 1 === mm && d.getDate() === jj;
    }
    case "cycle": {
      const last = lastDone(task, history);
      if (!last) return true;
      return daysBetween(new Date(dayKey(last)), new Date(dayKey(d))) >= (task.cycleDays || 7);
    }
    default:
      return false;
  }
}

/**
 * Heure propre à la tâche sur la frise.
 * Une heure explicite (posée à la main ou par glisser-déposer) prime toujours ;
 * sinon on retombe sur l'heure par défaut du créneau ou de la fréquence.
 */
export function taskTime(task, settings) {
  if (task.time) return task.time;
  if (task.freq === "quotidien") return settings.slots[task.slot || "soir"].time;
  if (task.freq === "hebdo") return settings.hebdo.time;
  if (task.freq === "mensuel") return task.paiement ? settings.paiements.time : settings.mensuel.time;
  return settings.annuel.time;
}

/** Tâches du jour, groupées par créneau (rangement par heure réelle) */
export function tasksForDay(tasks, history, date, settings) {
  const due = tasks.filter((t) => t.freq !== "exceptionnel" && isDueOn(t, history, date, settings));
  const groups = { matin: [], aprem: [], soir: [], autre: [] };
  const bounds = Object.entries(settings.slots)
    .map(([k, s]) => ({ k, min: toMin(s.time) }))
    .sort((a, b) => a.min - b.min);
  for (const t of due) {
    const m = toMin(taskTime(t, settings));
    if (t.freq === "quotidien" || t.time) {
      let slot = bounds[0].k;
      for (const b of bounds) if (m >= b.min) slot = b.k;
      groups[slot].push(t);
    } else groups.autre.push(t);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => toMin(taskTime(a, settings)) - toMin(taskTime(b, settings)));
  }
  return groups;
}

let idSeq = 1;
function notif(title, body, at, kids) {
  return {
    id: idSeq++,
    title,
    body,
    schedule: { at, allowWhileIdle: true },
    channelId: kids ? "enfants" : "famille",
    smallIcon: "ic_stat_maison",
    largeIcon: kids ? "badge_enfants" : undefined,
    iconColor: kids ? "#4CAF6D" : "#1F3A4D",
  };
}

const label = (t, members) => {
  const names = (t.assignees || [])
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter(Boolean);
  return names.length ? `${t.name} (${names.join(", ")})` : t.name;
};
const list = (arr, members) => arr.map((t) => label(t, members)).join(" · ");

/**
 * Notifications = points de contrôle.
 * À chaque heure de contrôle, alerte sur ce qui devait être fait AVANT cette
 * heure et n'est toujours pas validé. Le retard de la veille n'est jamais
 * rappelé : chaque journée repart à zéro.
 */
export function computeNotifications(tasks, history, settings, members = [], days = 10) {
  idSeq = 1;
  const out = [];
  const now = new Date();
  const checkpoints = settings.checkpoints || ["07:00", "17:30", "19:30", "21:00"];

  for (let i = 0; i < days; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);

    const due = tasks.filter(
      (t) => t.freq !== "exceptionnel" && t.freq !== "annuel" && isDueOn(t, history, day, settings)
    );
    if (!due.length) continue;

    let prev = -1;
    for (const cp of [...checkpoints].sort((a, b) => toMin(a) - toMin(b))) {
      const at = atTime(day, cp);
      const cpMin = toMin(cp);
      if (at > now) {
        const late = due.filter((t) => {
          const m = toMin(taskTime(t, settings));
          if (m > cpMin || m <= prev) return false;
          return !(i === 0 && doneOn(t, history, day));
        });
        const kids = late.filter((t) => t.kids);
        const adults = late.filter((t) => !t.kids);
        if (adults.length)
          out.push(notif("🏡 Petit point sur la maison", `Pas encore fait : ${list(adults, members)}`, at, false));
        if (kids.length)
          out.push(notif("🟢 Missions des enfants !", list(kids, members), at, true));
      }
      prev = cpMin;
    }
  }

  for (const t of tasks.filter((x) => x.freq === "annuel" && x.date)) {
    const [mm, jj] = t.date.split("-").map(Number);
    for (const yearOff of [0, 1]) {
      const target = new Date(now.getFullYear() + yearOff, mm - 1, jj);
      if (target < now) continue;
      for (const l of t.anniv ? [21, 7, 0] : [30, 7, 0]) {
        const at = atTime(new Date(target.getTime() - l * 86400000), settings.annuel.time);
        if (at <= now || daysBetween(now, at) > 60) continue;
        out.push(notif(
          `📅 ${l === 0 ? "C'est aujourd'hui" : "J-" + l} : ${t.name}`,
          t.anniv ? "Cadeau, gâteau, invitations… on s'y met ?" : "Un rappel pour anticiper.",
          at, false
        ));
      }
      break;
    }
  }

  const pod = settings.podium || { day: 0, time: "19:00" };
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    if (day.getDay() !== pod.day) continue;
    const at = atTime(day, pod.time);
    if (at <= now) continue;
    const totals = members
      .filter((m) => m.role !== "bebe")
      .map((m) => ({
        name: m.name,
        total: history.filter((e) => e.memberId === m.id && e.ts >= monday.getTime()).reduce((x, e) => x + e.pts, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    const medals = ["🥇", "🥈", "🥉"];
    out.push(notif(
      "🏆 Podium de la semaine !",
      totals.length && totals[0].total > 0
        ? totals.map((t, r) => `${medals[r]} ${t.name} ${t.total} pts`).join(" · ") + " — ouvre pour voir le podium !"
        : "Personne n'a marqué de points cette semaine… on se rattrape ?",
      at, false
    ));
    break;
  }

  out.sort((a, b) => a.schedule.at - b.schedule.at);
  return out.slice(0, 60);
}

/** Classement avec rangs partagés : les ex æquo obtiennent le même rang */
export function ranked(members, history, since) {
  const scored = members
    .filter((m) => m.role !== "bebe")
    .map((m) => ({
      ...m,
      total: history.filter((e) => e.memberId === m.id && e.ts >= since).reduce((s, e) => s + e.pts, 0),
    }))
    .sort((a, b) => b.total - a.total);
  let rank = 0, prevTotal = null;
  return scored.map((m, i) => {
    if (m.total !== prevTotal) { rank = i; prevTotal = m.total; }
    return { ...m, rank };
  });
}
