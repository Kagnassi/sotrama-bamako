# Sotrama Bamako

Jeu de conduite en 3D : on commence apprenti sur un Sotrama (minibus vert) dans les rues de Bamako et on finit grand transporteur avec ses propres Sotrama et ses cars sur les routes du Mali.

- **En ville** : de 6 h à 20 h, on prend les passagers dans 37 quartiers, on les dépose, on fait le plein et on évite les accidents. Il y a des feux tricolores avec des policiers aux carrefours, des contrôles de police, des vendeuses au bord de la route, des restaurants, des maquis et des dibiteries, ainsi que les hôpitaux Gabriel Touré et du Point G.
- **À pied** : le chauffeur peut descendre (touche E ou bouton « Descendre ») pour manger quand son énergie baisse, puis remonter dans son véhicule.
- **Négocier** : certains passagers discutent le prix de la course, on peut marchander avec les vendeuses et s'expliquer avec le policier (avertissement, amende réduite… ou plus chère si on proteste).
- **Police** : si un policier te voit griller un feu ou passer un contrôle, il te poursuit. Arrête-toi, sinon l'amende double.
- **Apprenti** : quand tu en as un, il descend aux arrêts et monte les bagages sur le toit.
- **Ville vivante** : piétons, vendeuses, boutiques, oiseaux qui s'envolent, motos Djakarta, taxis, voitures et 4x4.
- **Souris sur PC** : clic droit maintenu pour regarder autour, molette pour zoomer, touche V pour diriger à la souris (clic gauche = accélérer).
- **Carrière** : apprenti (25 % de la recette) → chauffeur (10 000 F de versement par jour au patron) → propriétaire → patron (tes chauffeurs te versent la recette) → chauffeur de car → transporteur → grand transporteur. On peut prendre des apprentis sous son aile : après 12 jours, ils deviennent chauffeurs.
- **Carte du Mali** : on choisit sa destination parmi 21 villes (Kayes, Kita, Nioro, Ségou, Niono, San, Mopti, Djenné, Sikasso, Gao, Tombouctou, Kidal…). La route nationale traverse la savane et des villages. Il y a des contrôles de police, des péages et des stations-service, et les passagers montent et descendent en chemin.
- **Voix** : l'apprenti crie les arrêts, et les passagers et les policiers parlent. Avec le **studio de voix** (`voix.html`), tu enregistres ta propre voix pour chaque phrase.

Auteur : Cheickné Kagnassi

## Contenu du dossier

| Dossier ou fichier | Rôle |
|---|---|
| `www/` | Le jeu lui-même (HTML, CSS, JavaScript), qui fonctionne aussi dans un navigateur |
| `www/js/world.js` | La ville : routes, ponts, ronds-points, quartiers, bâtiments, arrêts, stations |
| `www/js/textures.js` | Les textures dessinées par le code : façades, asphalte, couleurs des minibus, enseignes |
| `www/js/vehicles.js` | Le Sotrama du joueur, les motos Djakarta, les taxis, les autres Sotrama, les piétons |
| `www/js/route.js` | Les routes nationales entre deux villes : savane, villages, contrôles, péages, stations, gares routières |
| `www/js/mali.js` | La carte du Mali : frontières, fleuves, villes, lignes de car, distances et prix des billets |
| `www/js/voices.js` | Les voix du jeu : ta voix enregistrée, sinon un fichier de `www/voix/`, sinon la voix du téléphone |
| `www/voix.html` | Le studio de voix pour enregistrer tes phrases |
| `www/voix/` | Les voix livrées avec le jeu (fichiers audio + `liste.json`) |
| `www/js/game.js` | Les règles : conduite, passagers, carburant, carrière, flotte, équipe, voyages en car, menus |
| `www/js/monetization.js` | Les publicités AdMob et l'achat « Retirer les pubs » |
| `www/privacy.html` | La politique de confidentialité, obligatoire sur les stores |
| `android/` | Le projet Android Studio (Play Store) |
| `ios/` | Le projet Xcode (App Store) |
| `assets/` | L'icône et l'écran de démarrage d'origine |
| `capacitor.config.json` | Le nom et l'identifiant de l'application : `com.kagnassi.sotramabamako` |

## Mettre ta voix dans le jeu pour tout le monde

1. Ouvre le jeu, puis **Studio de voix** (en bas du menu).
2. Enregistre les phrases que tu veux. Dans le jeu, sur ton appareil, elles remplacent tout de suite la voix du téléphone.
3. Clique sur **Tout télécharger (.zip)**, puis dézippe `voix-sotrama.zip` dans le dossier `www/voix/` du projet en remplaçant `liste.json`.
4. Lance `git add www/voix`, `git commit -m "Ma voix"` et `git push`. Le site et l'APK se mettent à jour avec ta voix.

Aucune image ni aucun modèle 3D externe n'est utilisé : tout est dessiné par le code, donc il n'y a pas de droits d'auteur à régler pour les visuels. Les seules ressources externes sont incluses dans le dossier avec leur licence : three.js et JSZip (licence MIT) et les polices Barlow et Bowlby One (licence SIL OFL).

## 1. Tester le jeu sur ton PC

Il faut [Node.js](https://nodejs.org) en version 22 ou plus.

```
npm install
npx http-server www -p 8080 -c-1
```

Puis ouvre http://localhost:8080 dans Chrome. Avec VS Code, l'extension « Live Server » fait la même chose : clic droit sur `www/index.html`, puis « Open with Live Server ».

## 2. Mettre le jeu en ligne gratuitement (lien à partager)

Le fichier `.github/workflows/pages.yml` publie automatiquement le dossier `www` sur GitHub Pages à chaque `git push`.

1. Pousse le projet sur GitHub (dépôt `sotrama-bamako`).
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Après 1 à 2 minutes, le jeu est en ligne : `https://ton-pseudo.github.io/sotrama-bamako/`
4. La politique de confidentialité est à `https://ton-pseudo.github.io/sotrama-bamako/privacy.html`. Les stores la demandent.

Sur téléphone, ouvre le lien puis « Ajouter à l'écran d'accueil » : le jeu s'ouvre en plein écran comme une application. Dans cette version web, il n'y a ni publicités ni achats.

## Faire essayer le jeu à des amis

Deux fichiers dans `.github/workflows/` travaillent tout seuls à chaque `git push` :
- `pages.yml` met la version web en ligne : `https://ton-pseudo.github.io/sotrama-bamako/`
- `android-apk.yml` construit l'application Android et la met en téléchargement : `https://github.com/ton-pseudo/sotrama-bamako/releases/download/test/SotramaBamako.apk`

**Ce que tes amis doivent faire :**
- **Sur Android :** ouvrir le lien de l'APK, l'installer et autoriser « installer des applis inconnues ». Les nouvelles versions s'installent par-dessus l'ancienne.
- **Sur iPhone :** ouvrir le lien web dans Safari, puis Partager → « Sur l'écran d'accueil ».

Le suivi des constructions se trouve dans l'onglet **Actions** du dépôt : une coche verte veut dire que la construction a réussi.

## 3. Publier sur le Play Store (Android)

**Prérequis :**
- Android Studio (version récente) ;
- un compte Google Play Console : 25 $, à payer une seule fois.

1. Prépare le projet :
   ```
   npm install
   npx cap sync android
   npx cap open android
   ```
2. Dans Android Studio, lance le jeu sur ton téléphone (câble USB et mode développeur activé) pour vérifier.
3. Crée la version à publier : **Build → Generate Signed App Bundle → Android App Bundle**. Crée une clé de signature (`.jks`).
   - **Garde ce fichier et son mot de passe en lieu sûr.** Sans eux, tu ne pourras plus jamais publier de mise à jour.
4. Dans la Play Console, crée l'application et remplis la fiche :
   - description ;
   - captures d'écran en paysage ;
   - icône 512 × 512 (`assets/icon-only.png` réduit) ;
   - catégorie « Course » ou « Simulation » ;
   - lien de la politique de confidentialité.
5. Déclare que l'application contient des publicités et vise un public de **13 ans et plus**. Pour un public plus jeune, Google impose des règles spéciales pour les publicités.
6. **Pour un nouveau compte personnel**, Google exige d'abord un **test fermé avec au moins 12 testeurs pendant 14 jours** avant de pouvoir publier en production. Invite des amis ou des camarades de l'ESEO.
7. Envoie le fichier `.aab`, puis passe du test fermé à la production.

## 4. Publier sur l'App Store (iPhone)

**Prérequis :**
- **un Mac avec Xcode** : on ne peut pas publier sur l'App Store depuis Windows ;
- l'Apple Developer Program : 99 $ par an.

1. Sur le Mac :
   ```
   npm install
   npx cap sync ios
   npx cap open ios
   ```
2. Dans Xcode, onglet **Signing & Capabilities** :
   - choisis ton équipe Apple ;
   - ajoute la capacité **In-App Purchase**.
3. **Product → Archive**, puis **Distribute App** vers App Store Connect.
4. Dans App Store Connect, remplis la fiche, les captures d'écran et le lien de confidentialité. Réponds aussi au questionnaire « App Privacy » : identifiant publicitaire utilisé pour la publicité.
5. Note : le projet iOS utilise Swift Package Manager. Si l'achat « Retirer les pubs » ne fonctionne pas sur iPhone, recrée le projet iOS avec CocoaPods. Le plugin d'achat est un plugin Cordova.
   ```
   rm -rf ios
   npx cap add ios --packagemanager CocoaPods
   ```

## 5. Gagner de l'argent avec le jeu

Le jeu a trois sources de revenus déjà codées :

| Source | Où dans le jeu | Ce qu'il faut configurer |
|---|---|---|
| Publicité récompensée | Fin de journée : « Regarder une pub » pour doubler les courses. Panne sèche : remorquage gratuit | Un bloc d'annonces « Avec récompense » dans AdMob |
| Publicité interstitielle | Une pub plein écran toutes les deux journées | Un bloc d'annonces « Interstitiel » dans AdMob |
| Achat « Retirer les pubs » | Bouton dans le garage | Un produit `remove_ads` dans la Play Console et dans App Store Connect |

**AdMob, étape par étape :**
1. Crée un compte sur https://admob.google.com et ajoute l'application (Android, puis iOS).
2. Crée deux blocs d'annonces : « Avec récompense » et « Interstitiel ».
3. Remplace les identifiants de **test** de Google par les tiens. Ne publie jamais avec les identifiants de test, et ne clique jamais sur tes propres pubs : Google peut fermer le compte.
   - dans `www/js/monetization.js` : les identifiants des blocs, et `testing: false` ;
   - dans `android/app/src/main/AndroidManifest.xml` : l'identifiant d'application AdMob ;
   - dans `ios/App/App/Info.plist` : `GADApplicationIdentifier`.
4. Dans AdMob, **Confidentialité et messages** : crée le message de consentement RGPD. Le jeu l'affiche tout seul aux joueurs européens.
5. Ajoute un fichier `app-ads.txt` sur ton site (GitHub Pages convient). AdMob donne son contenu.

**Achat « Retirer les pubs » :**
- **Play Console :** Monétiser → Produits intégrés → crée `remove_ads`, par exemple à 1,99 €.
- **App Store Connect :** crée un achat intégré **non consommable** `remove_ads`.
- Remplis les profils de paiement et d'impôts : profil marchand Google, et accords, taxes et coordonnées bancaires chez Apple. Sinon, aucun paiement n'arrive.

Les revenus dépendent surtout du nombre de joueurs. Partager le jeu (TikTok, WhatsApp, groupes maliens) compte plus que le nombre de pubs.

Après chaque modification du dossier `www`, lance `npx cap sync` avant de recompiler l'application.

## 6. Modifier le jeu

| Ce que tu veux changer | Où le changer |
|---|---|
| Durée d'une journée, prix du carburant, places | En haut de `www/js/game.js` : `DAY`, `FUEL_PRICE`, `CAP` |
| Prix des améliorations | `www/js/game.js` : `ENGINE` et `TANK` |
| Quartiers et arrêts | `www/js/world.js` : liste `STOPS` (nom, route, position, côté) |
| Nouvelles routes | `www/js/world.js` : appels `path([[x1, z1], [x2, z2]], largeur)` |
| Couleurs et slogans des Sotrama | `www/js/textures.js` : `LIVERIES` |
| Enseignes des boutiques | `www/js/textures.js` : `SIGNS` |

Avant de publier, vérifie que le nom « Sotrama Bamako » n'est pas déjà pris sur les stores.

## Avant de publier : liste à cocher

- [ ] Identifiants AdMob réels dans les trois fichiers, et `testing: false`
- [ ] Adresse e-mail de contact dans `www/privacy.html`
- [ ] Politique de confidentialité en ligne (GitHub Pages)
- [ ] Produit `remove_ads` créé sur les deux stores
- [ ] `versionCode` / `versionName` augmentés à chaque mise à jour (`android/app/build.gradle`)
- [ ] Clé de signature Android sauvegardée
- [ ] Test sur un vrai téléphone Android d'entrée de gamme (réglage « Graphismes : économie »)
