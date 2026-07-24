// ─────────────────────────────────────────────────────────────────────
//  CONFIGURATION FIREBASE
//  Colle ici les valeurs données par la console Firebase (étape 4 de la
//  feuille de route). Tant que "apiKey" est vide, l'appli fonctionne
//  normalement mais SANS synchronisation : chaque téléphone reste isolé.
// ─────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Nom du "carnet" partagé par la famille. À garder identique sur tous les
// téléphones du foyer. Change-le si tu veux repartir de zéro.
export const FOYER_ID = "famille-wucher";
