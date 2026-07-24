# Le Tableau du Foyer 🏡

Appli familiale de répartition des tâches : Vanessa, Loïs, Lou (7 ans), Noé (5 ans), Léon, Mélisse 🐕, Syrah 🐕 et la tortue 🐢.

- **Aujourd'hui** : les tâches du jour avec leur heure, barre de progression, validation qui demande **qui l'a faite** — rien n'est coché d'avance, chacun se désigne et ajoute ceux qui l'ont aidé, chacun gagne les points entiers, Le panneau de validation propose aussi **🔔 Notifier un membre** : on bascule, on coche le ou les destinataires, on valide, et un rappel bienveillant part en notification.
- **Planning** : frise horaire du jour (Matin · Midi · Soir · Coucher), navigation de J-1 à J+7, **glisser une tâche à l'horizontale pour changer son heure** (aimantée au quart d'heure, valable aussi les jours suivants), et bibliothèque des fiches repliée par fréquence puis catégorie.
La barre d'onglets s'escamote automatiquement pour libérer l'écran et revient dès qu'on redescend ou qu'on atteint le bas de la page (une poignée permet aussi de la rappeler d'un tap).

- **Scores** : podium 🥇🥈🥉 avec photos de profil, classement, journal. Confettis 🎉 à chaque validation. La semaine démarre automatiquement le lundi et une notification "🏆 Podium de la semaine" part chaque dimanche soir (heure réglable) avec le top 3.
- **Réglages** : horaires des rappels, jour hebdo/mensuel/paiements, photos de profil (📷, stockées localement, recadrées automatiquement), tests de notification.

Fréquences gérées : quotidien (par créneau), cycle glissant ("tous les X jours depuis la dernière fois", ex. poubelles = 4 jours, rappel 7h00), hebdomadaire, mensuel (+ paiements le 25), annuel (rappels J-30 et J-7, J-21/J-7 pour les anniversaires), exceptionnel (liste sans rappel).

Notifications Android : **points de contrôle** (7h · 17h30 · 19h30 · 21h, réglables). À chaque heure, l'appli signale ce qui devait être fait avant et n'est pas encore validé — jamais le retard de la veille. Canal distinct **"Missions des enfants 🟢"** avec badge vert et icône maison identifiable. Les rappels sont recalculés à chaque ouverture de l'appli et à chaque validation.

---

## Mise en route (une seule fois, ~10 min)

### 1. Pousser le code sur GitHub

Créer un dépôt **privé** sur github.com (ex. `tableau-du-foyer`), puis dans ce dossier :

```bash
git init
git add .
git commit -m "Le tableau du foyer"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/tableau-du-foyer.git
git push -u origin main
```

### 2. Activer GitHub Pages (pour l'iPhone de Vanessa)

Sur GitHub : **Settings → Pages → Source : GitHub Actions**. C'est tout.

> Dépôt privé : Pages nécessite un compte GitHub Pro (ou un dépôt public). Si tu veux rester en privé sans Pro, tu peux aussi déployer le dossier `dist` sur **Azure Static Web Apps** comme ton appli repas — le build web est standard.

### 3. Récupérer l'APK (pour ton Android)

Le push déclenche la compilation automatiquement. Ensuite :

1. GitHub → onglet **Actions** → dernier run vert → section **Artifacts** → télécharger `tableau-du-foyer-apk`.
2. Dézipper, envoyer `app-debug.apk` sur ton téléphone (mail, câble, Drive…).
3. Sur le téléphone : ouvrir le fichier → autoriser "installer des applis de sources inconnues" pour l'appli utilisée → installer.
4. Au premier lancement, **accepter les notifications**. Dans Réglages de l'appli, tester les deux boutons de notification.

À chaque modification du code : `git push`, et un nouvel APK est compilé.

### 4. Installer sur l'iPhone de Vanessa (PWA)

1. Ouvrir l'adresse GitHub Pages dans **Safari** (affichée dans Actions → job "web").
2. Bouton **Partager → Sur l'écran d'accueil**.
3. L'appli s'ouvre en plein écran avec son icône, comme une appli normale.

L'appli est une PWA complète : manifest, icônes, mode plein écran et **service worker** (elle s'ouvre instantanément et fonctionne sans réseau une fois installée).

⚠️ Sur iPhone, cette version sert de **tableau de bord partagé** (tâches, scores, planning) mais **sans notifications sur écran verrouillé** : Apple ne le permet pas sans serveur de push. Si besoin plus tard, une Azure Function + Web Push peut être ajoutée.

> Les données sont locales à chaque téléphone (pas de synchro entre les deux dans cette v1). Le téléphone Android est le "poste de commandement" des rappels ; une synchro via Azure Table Storage est la prochaine étape naturelle si vous en ressentez le besoin.

---

## Développement local (optionnel)

```bash
npm install
npm run dev        # http://localhost:5173
```

Structure : `src/data.js` (tâches et membres par défaut) · `src/scheduler.js` (fréquences et calcul des rappels) · `src/notifications.js` (canaux Android) · `src/App.jsx` (les 4 écrans).
