// ─────────────────────────────────────────────────────────────────────
//  CONFIGURATION FIREBASE
//  Colle ici les valeurs données par la console Firebase (étape 4 de la
//  feuille de route). Tant que "apiKey" est vide, l'appli fonctionne
//  normalement mais SANS synchronisation : chaque téléphone reste isolé.
// ─────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyBbolPLCBBq2OdKOfgL5FPnzL4KxHCEwtk",
  authDomain: "tableau-du-foyer.firebaseapp.com",
  projectId: "tableau-du-foyer",
  storageBucket: "tableau-du-foyer.firebasestorage.app",
  messagingSenderId: "661276884651",
  appId: "1:661276884651:web:7b7d626d1cd567f06a41ee",
};

// Nom du "carnet" partagé par la famille. À garder identique sur tous les
// téléphones du foyer. Change-le si tu veux repartir de zéro.
export const FOYER_ID = "famille-wucher";
