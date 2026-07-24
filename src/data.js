// ─── Données par défaut du foyer ────────────────────────────────────
// Tout est modifiable ensuite dans l'appli (onglet Planning et Réglages).

export const CATS = {
  menage:    { label: "Ménage",    emoji: "🧹", color: "#4A90D9" },
  cuisine:   { label: "Cuisine",   emoji: "🍳", color: "#D94F4F" },
  linge:     { label: "Linge",     emoji: "🧺", color: "#3BAFA8" },
  exterieur: { label: "Extérieur", emoji: "🌿", color: "#4CAF6D" },
  animaux:   { label: "Animaux",   emoji: "🐾", color: "#F2A93B" },
  enfants:   { label: "Enfants",   emoji: "🧒", color: "#E06AA3" },
  admin:     { label: "Admin & RDV", emoji: "📋", color: "#8B7BC7" },
  maison:    { label: "Entretien maison", emoji: "🔧", color: "#7A8A5A" },
};

export const DEFAULT_MEMBERS = [
  { id: "vanessa", name: "Vanessa", role: "parent", emoji: "🌸", color: "#E06AA3" },
  { id: "lois",    name: "Loïs",    role: "parent", emoji: "⚡", color: "#4A90D9" },
  { id: "lou",     name: "Lou",     role: "enfant", emoji: "🦊", color: "#F2A93B", birth: "2018-12-27" },
  { id: "noe",     name: "Noé",     role: "enfant", emoji: "🐸", color: "#4CAF6D", birth: "2021-02-24" },
  { id: "leon",    name: "Léon",    role: "bebe",   emoji: "🐣", color: "#8B7BC7", birth: "2026-01-10" },
];

// Créneaux de la journée (fiches en T) — horaires modifiables dans Réglages
export const DEFAULT_SLOTS = {
  matin:  { label: "Matin",        time: "07:00", emoji: "🌅" },
  aprem:  { label: "Fin d'aprèm",  time: "17:30", emoji: "🎒" },
  soir:   { label: "Soir",         time: "19:30", emoji: "🌙" },
};

export const DEFAULT_SETTINGS = {
  slots: DEFAULT_SLOTS,
  // Points de contrôle : à chaque heure, alerte sur ce qui devait être fait
  // AVANT cette heure et n'est toujours pas validé (jamais le retard de la veille)
  checkpoints: ["07:00", "17:30", "19:30", "21:00"],
  hebdo: { day: 6, time: "10:00" },      // samedi
  mensuel: { day: 1, time: "09:00" },    // ménage de fond
  paiements: { day: 25, time: "09:00" }, // nounou, cantine, garderie
  annuel: { time: "10:00" },             // heure des rappels J-30 / J-7
  podium: { day: 0, time: "19:00" },     // classement du dimanche soir
};

// freq : quotidien | hebdo | mensuel | annuel | cycle | exceptionnel
// assignees : [ids] → tâche nominative (points crédités à ces membres)
// kids : true → notification verte "missions enfants", faisable par Lou/Noé
// slot : créneau pour les quotidiennes
// cycleDays + time : pour les cycles glissants ("tous les X jours depuis la dernière fois")
// monthDay / weekDay / date (MM-JJ) selon la fréquence
let n = 0;
const t = (name, cat, freq, extra = {}) => ({
  id: "d" + n++, name, cat, freq, pts: extra.pts ?? 2, kids: !!extra.kids, ...extra,
});

export const DEFAULT_TASKS = [
  // ── Quotidien · Matin 7h ──────────────────────────────────────────
  t("Nourrir Mélisse & Syrah", "animaux", "quotidien", { slot: "matin", kids: true, pts: 1 }),
  t("Nourrir les tortues", "animaux", "quotidien", { slot: "matin", kids: true, pts: 1 }),
  t("Laver les lunettes de Noé", "enfants", "quotidien", { slot: "matin", kids: true, pts: 1, assignees: ["lou"] }),
  t("Lancer une machine (trier, préparer)", "linge", "quotidien", { slot: "matin", pts: 2 }),

  // ── Quotidien · Fin d'après-midi 17h30 ────────────────────────────
  t("Devoirs", "enfants", "quotidien", { slot: "aprem", kids: true, pts: 2, assignees: ["lou"] }),
  t("Promener Mélisse", "animaux", "quotidien", { slot: "aprem", kids: true, pts: 2 }),
  t("Ranger les chaussures", "menage", "quotidien", { slot: "aprem", kids: true, pts: 1 }),

  // ── Quotidien · Soir 19h30 ────────────────────────────────────────
  t("Préparer le repas", "cuisine", "quotidien", { slot: "soir", pts: 3 }),
  t("Vaisselle (faire · lancer · vider)", "cuisine", "quotidien", { slot: "soir", pts: 2 }),
  t("Aspirateur (pièces de vie)", "menage", "quotidien", { slot: "soir", pts: 3 }),
  t("Tineco", "menage", "quotidien", { slot: "soir", pts: 2 }),
  t("Nettoyer WC · évier cuisine · évier SDB", "menage", "quotidien", { slot: "soir", pts: 2 }),
  t("Déshumidificateur (allumer · vider)", "maison", "quotidien", { slot: "soir", pts: 1 }),
  t("Étendre · plier · ranger le linge", "linge", "quotidien", { slot: "soir", kids: true, pts: 2 }),

  // ── Cycles glissants ("tous les X jours") ─────────────────────────
  t("Sortir la poubelle", "menage", "cycle", { cycleDays: 4, time: "07:00", pts: 1, kids: true }),
  t("Laver la poubelle", "menage", "cycle", { cycleDays: 14, time: "10:00", pts: 2 }),
  t("Litière", "animaux", "cycle", { cycleDays: 7, time: "10:00", pts: 2 }),
  t("Changer draps · serviettes · torchons · bavoirs · éponge", "linge", "cycle", { cycleDays: 7, time: "10:00", pts: 3 }),

  // ── Hebdomadaire (samedi 10h par défaut) ──────────────────────────
  t("Crottes de chien (jardin)", "animaux", "hebdo", { pts: 2, kids: true }),
  t("Courses", "cuisine", "hebdo", { pts: 3 }),
  t("Véranda", "menage", "hebdo", { pts: 2 }),
  t("Laver la gazinière", "cuisine", "hebdo", { pts: 2 }),

  // ── Mensuel (le 1er, 9h) ──────────────────────────────────────────
  t("Ranger sous les lits · sous le canapé · ce qui traîne", "menage", "mensuel", { kids: true, pts: 3 }),
  t("Poussière · toiles d'araignée · plinthes", "menage", "mensuel", { pts: 3 }),
  t("Laver carreaux · four · micro-ondes · cafetière · grille-pain · frigo · caisse SDB", "cuisine", "mensuel", { pts: 4 }),
  t("Acheter les couches (Noé · Léon)", "enfants", "mensuel", { pts: 1 }),
  t("RDV sage-femme (Léon)", "admin", "mensuel", { pts: 1 }),
  t("Coiffeur", "admin", "mensuel", { pts: 1 }),
  t("Orthoptiste", "admin", "mensuel", { pts: 1 }),

  // ── Mensuel · Paiements (le 25) ───────────────────────────────────
  t("Nounou : planning + paiement", "admin", "mensuel", { paiement: true, pts: 1 }),
  t("Cantine : planning + paiement", "admin", "mensuel", { paiement: true, pts: 1 }),
  t("Garderie : planning + paiement", "admin", "mensuel", { paiement: true, pts: 1 }),

  // ── Annuel (rappels J-30 puis J-7) ────────────────────────────────
  t("Impôts sur le revenu", "admin", "annuel", { date: "05-25", pts: 2 }),
  t("Taxe foncière", "admin", "annuel", { date: "10-10", pts: 2 }),
  t("Vétérinaire Mélisse", "animaux", "annuel", { date: "09-15", pts: 1 }),
  t("Vétérinaire Syrah", "animaux", "annuel", { date: "09-15", pts: 1 }),
  t("RDV médicaux : vaccins · dentiste · lunettes · bilan annuel", "admin", "annuel", { date: "09-01", pts: 2 }),
  t("Licence sport : chercher + papiers", "admin", "annuel", { date: "08-20", pts: 1 }),
  t("Abonnement École des loisirs", "admin", "annuel", { date: "09-05", pts: 1 }),
  t("Garde-robe : vêtements · chaussures · bottes · crocs", "enfants", "annuel", { date: "08-25", pts: 2 }),
  t("Trier jouets · vêtements été/hiver · trop petits", "enfants", "annuel", { date: "10-01", kids: true, pts: 3 }),
  t("Voiture : entretien + CT", "maison", "annuel", { date: "03-15", pts: 2 }),
  t("Laver les voitures", "maison", "annuel", { date: "06-01", kids: true, pts: 3 }),
  t("Pompe à chaleur : entretien", "maison", "annuel", { date: "10-15", pts: 1 }),
  t("Purger les radiateurs", "maison", "annuel", { date: "10-20", pts: 2 }),
  t("Laver les radiateurs", "maison", "annuel", { date: "10-20", pts: 2 }),
  t("Cadeaux famille & Noël", "admin", "annuel", { date: "12-25", pts: 2 }),
  t("Anniversaire Lou 🎂", "admin", "annuel", { date: "12-27", pts: 2, anniv: true }),
  t("Anniversaire Noé 🎂", "admin", "annuel", { date: "02-24", pts: 2, anniv: true }),
  t("Anniversaire Léon 🎂", "admin", "annuel", { date: "01-10", pts: 2, anniv: true }),

  // ── Exceptionnel (liste "à ne pas oublier", sans notification) ────
  t("Architecte", "maison", "exceptionnel", { pts: 0 }),
  t("Maçon", "maison", "exceptionnel", { pts: 0 }),
  t("Voiture : vendre / acheter", "maison", "exceptionnel", { pts: 0 }),
  t("Trier vêtements bébé · jouets · mobilier", "enfants", "exceptionnel", { pts: 0 }),
  t("Bouteilles de gaz", "maison", "exceptionnel", { pts: 0 }),
];
