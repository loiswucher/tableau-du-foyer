import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export const isNative = () => Capacitor.isNativePlatform();

/** Demande la permission et crée les deux canaux Android */
export async function initNotifications() {
  if (!isNative()) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;

    // Canal famille : rappels standards
    await LocalNotifications.createChannel({
      id: "famille",
      name: "Rappels du foyer",
      description: "Tâches du foyer pour les parents",
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: "#1F3A4D",
      vibration: true,
    });

    // Canal enfants : visuel vert distinct + son visible sur écran verrouillé
    await LocalNotifications.createChannel({
      id: "enfants",
      name: "Missions des enfants 🟢",
      description: "Tâches que Lou et Noé peuvent faire",
      importance: 5,
      visibility: 1,
      lights: true,
      lightColor: "#4CAF6D",
      vibration: true,
    });
    return true;
  } catch (e) {
    console.error("Init notifications impossible", e);
    return false;
  }
}

/** Remplace toutes les notifications programmées par la nouvelle liste */
export async function reschedule(notifs) {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    if (notifs.length) {
      await LocalNotifications.schedule({
        notifications: notifs.map((n) => ({
          ...n,
          schedule: { ...n.schedule, at: new Date(n.schedule.at) },
        })),
      });
    }
  } catch (e) {
    console.error("Programmation des rappels impossible", e);
  }
}

/** Rappel bienveillant immédiat ("tendre la main") */
export async function pokeNotification(message, kids) {
  if (!isNative()) return alert(message + "\n\n(Sur l'appli Android installée, ce message arrive en vraie notification.)");
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 900000 + Math.floor(Math.random() * 1000),
        title: "🤝 Un petit coup de main ?",
        body: message,
        channelId: kids ? "enfants" : "famille",
        smallIcon: "ic_stat_maison",
        largeIcon: kids ? "badge_enfants" : undefined,
        iconColor: kids ? "#4CAF6D" : "#1F3A4D",
        schedule: { at: new Date(Date.now() + 2000) },
      },
    ],
  });
}

/** Notification de test immédiate (bouton dans Réglages) */
export async function testNotification(kids) {
  if (!isNative()) return alert("Les notifications ne fonctionnent que dans l'appli Android installée (APK). Sur iPhone, utilisez l'appli comme tableau de bord.");
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 999999,
        title: kids ? "🟢 Missions des enfants !" : "🏡 Le foyer a besoin de vous",
        body: kids ? "Ceci est un test : nourrir Mélisse & Syrah" : "Ceci est un test de rappel.",
        channelId: kids ? "enfants" : "famille",
        smallIcon: "ic_stat_maison",
        largeIcon: kids ? "badge_enfants" : undefined,
        iconColor: kids ? "#4CAF6D" : "#1F3A4D",
        schedule: { at: new Date(Date.now() + 3000) },
      },
    ],
  });
}
