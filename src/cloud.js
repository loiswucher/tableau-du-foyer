// ─────────────────────────────────────────────────────────────────────
//  Synchronisation entre les téléphones du foyer (Firebase Firestore)
//
//  Principe : un seul document partagé contient l'état du foyer (membres,
//  tâches, réglages, historique). Chaque téléphone l'écoute en temps réel
//  et y écrit ses changements. Si Firebase n'est pas configuré, tout est
//  simplement désactivé et l'appli fonctionne en local, comme avant.
// ─────────────────────────────────────────────────────────────────────
import { firebaseConfig, FOYER_ID } from "./firebase-config.js";

export const cloudEnabled = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let docRef = null;
let ready = null;

async function init() {
  if (!cloudEnabled()) return null;
  if (ready) return ready;
  ready = (async () => {
    const { initializeApp } = await import("firebase/app");
    const { getAuth, signInAnonymously } = await import("firebase/auth");
    const {
      getFirestore, doc, enableIndexedDbPersistence,
    } = await import("firebase/firestore");

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    // Cache local : l'appli reste utilisable sans réseau
    try { await enableIndexedDbPersistence(db); } catch (e) { /* déjà actif ou onglet multiple */ }
    await signInAnonymously(getAuth(app));
    docRef = doc(db, "foyers", FOYER_ID);
    return docRef;
  })();
  return ready;
}

/**
 * Écoute le carnet partagé. `onRemote` est appelé à chaque changement
 * venant d'un autre téléphone. Renvoie une fonction pour arrêter l'écoute.
 */
export async function subscribe(onRemote, onStatus) {
  const ref = await init();
  if (!ref) return () => {};
  const { onSnapshot } = await import("firebase/firestore");
  return onSnapshot(
    ref,
    (snap) => {
      onStatus?.(snap.metadata.fromCache ? "hors ligne" : "connecté");
      if (snap.exists()) onRemote(snap.data());
    },
    (err) => { console.warn("Synchro interrompue", err); onStatus?.("erreur"); }
  );
}

/** Envoie l'état du foyer vers le carnet partagé. */
export async function push(state) {
  const ref = await init();
  if (!ref) return;
  const { setDoc } = await import("firebase/firestore");
  // L'historique est plafonné pour rester léger (limite de 1 Mo par document)
  const history = state.history.slice(-400);
  await setDoc(ref, {
    members: state.members,
    tasks: state.tasks,
    settings: state.settings,
    history,
    weekStart: state.weekStart,
    rev: state.rev ?? 0,
    updatedAt: Date.now(),
  });
}
