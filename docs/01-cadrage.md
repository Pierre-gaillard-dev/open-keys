# Open Keys — Note de cadrage

> Statut : validé à l'issue de la session de cadrage (« grill-me ») du 2026-11-16.

## 1. Vision

Une application personnelle pour **apprendre le piano sans savoir lire une partition**, en mode *falling notes* : les notes tombent vers un clavier virtuel, à la manière des tutos YouTube. L'application lit des fichiers **MIDI** issus d'un catalogue personnel hébergé sur un serveur, et fonctionne sur **Android, Windows 11 et Ubuntu**.

## 2. Contexte

| Élément | Valeur |
|---|---|
| Utilisateur | L'auteur, développeur, sans connaissance du solfège ; depuis la V1.4, quelques proches invités (D29) |
| Instrument | Yamaha P-120 : MIDI IN/OUT en DIN 5 broches, pas d'USB, pas de câble pour l'instant |
| Appareils | Pixel 10 (Firefox), PC Windows 11, PC Ubuntu |
| Usage principal | Téléphone en paysage sur un trépied posé sur le piano, à environ 50 cm des yeux |
| Infrastructure | VPS OVH (environ 75 Go) avec Dokploy |
| Développement | Fait par IA, avec des revues attentives de l'architecture et du code |
| Finalité | Usage personnel et projet de portfolio (dépôt GitHub). Ni service public ni commercialisation |

## 3. Objectifs

1. Apprendre des morceaux en **regardant et en écoutant** : notes qui tombent, couleur par main, vitesse réglable, boucles.
2. Gérer facilement un **catalogue de MIDI centralisé**, partagé entre tous les appareils.
3. **Retenir la pratique** : reprise de la lecture, boucles sauvegardées, temps de pratique, statut par morceau.
4. Fonctionner **hors-ligne** pour les morceaux déjà consultés.
5. Préparer, sans la réaliser dans le MVP, l'**entrée MIDI** du P-120 (vérification des notes, mode attente).
6. Avoir un **code exemplaire** (portfolio) : découpage par fonctionnalité, typage de bout en bout, documentation.

## 4. Non-objectifs

- Afficher des partitions (solfège).
- Détecter les notes au **micro**.
- Ouvrir le service au public, avoir un catalogue communautaire, monétiser.
- Héberger ou distribuer des MIDI sous droits d'auteur dans le dépôt.
- Publier dans les stores (sauf éventuellement une APK Capacitor en V2, voir les risques).

## 5. Périmètre

### MVP
- **Lecteur** : notes qui tombent, clavier de 88 touches avec touches allumées pendant le jeu, couleur par main, vitesse de 25 à 100 % sans changer la hauteur des notes, boucle A-B, une main à la fois (son coupé et/ou main masquée), lecture/pause, barre de progression déplaçable.
- **Son** : échantillons Salamander Grand Piano allégés (deux niveaux de vélocité), pédale de sustain (CC64).
- **Ergonomie** : paysage sur mobile, plein écran, Wake Lock, contrôles qui disparaissent, raccourcis clavier sur PC, thème sombre, repère sur chaque C (C4 mis en évidence).
- **Catalogue** : import par fichier ou par URL, écran de vérification (pistes, mains, métadonnées), liste avec recherche et filtres.
- **Métadonnées** : titre, compositeur, difficulté (1 à 5), tags libres, favori, source, licence.
- **Couverture** : WebP 720×720, suggérée automatiquement (pochette via MusicBrainz, portrait du compositeur via Wikidata), ou fournie à la main. Couverture générée si absente.
- **Pratique** : réglages par morceau (vitesse, mains, position), boucles nommées, sessions et temps de pratique, statut (à apprendre / en cours / maîtrisé).
- **Hors-ligne** : application installable (PWA), morceaux consultés et favoris disponibles sans réseau, file d'attente de synchronisation pour les données de pratique.
- **Authentification** mono-utilisateur, avec un modèle de données prêt pour plusieurs utilisateurs (multi-utilisateur en V1.4, D29).

### Plus tard, par ordre de priorité
1. Zoom automatique du clavier sur la plage de notes utilisée (**V1.1**)
2. Recherche et import depuis des **bibliothèques en ligne** : Mutopia, MAESTRO, xivmidi (V1.1)
3. Décompte avant le départ
4. Nom des notes, en notation anglaise (C, D, E…)
5. Métronome
6. Volume par main
7. Vitesse cible par boucle et tableau de bord de pratique
8. **Accompagnement** : garder les autres instruments d'un MIDI, avec leur son, et les activer ou les couper dans le lecteur (V1.4)
9. **V2 — entrée MIDI** : vérification des notes, mode attente, score, pause avec une touche du piano
10. Gamification (séries de jours, objectifs)

## 6. Contraintes

- **Une seule base de code** pour les trois plateformes.
- **Firefox** est le navigateur principal, sur PC comme sur Android. Tout doit aussi être testé sur Chromium.
- HTTPS obligatoire (PWA, Service Worker, Wake Lock).
- Déploiement via Dokploy : **deux conteneurs** (`web` nginx + `api` Hono) orchestrés par un `docker-compose`, sur un seul domaine. Un volume persistant pour SQLite et les fichiers ; pas de conteneur de base de données.
- Pas de secrets ni de contenu protégé dans le dépôt. Les attributions de licence sont respectées (échantillons Salamander en CC-BY).
- L'instance reste privée (cercle restreint) : l'app peut importer des arrangements sous droits (xivmidi), **toujours crédités** (bibliothèque, lien, arrangeur ou interprète, licence quand elle est connue). Les fichiers vivent sur le serveur, jamais dans le dépôt. Aucune protection d'un site n'est contournée (`robots.txt`, blocage des robots, connexion, conditions d'utilisation).

## 7. Décisions

| # | Sujet | Décision | Pourquoi |
|---|---|---|---|
| D1 | Entrée | MVP « regarder et écouter » ; MIDI en V2 derrière une couche « source d'entrée » abstraite | Pas de câble pour l'instant ; on évite de tout refaire plus tard |
| D2 | Fonctions du lecteur | Notes qui tombent + clavier, vitesse, boucle A-B, une main à la fois, barre de progression | Sans retour du clavier, la valeur vient des outils de contrôle de la lecture |
| D3 | Utilisateurs | Un seul, avec `users` et `user_id` partout | Passer à quelques comptes sans migration douloureuse |
| D4 | Hébergement | VPS OVH existant, Dokploy, Docker | Infrastructure déjà en place, coût nul |
| D5 | Backend | Hono + Drizzle + SQLite, monorepo pnpm en TypeScript | Logique métier spécifique (MIDI), types partagés de bout en bout |
| D6 | Hors-ligne | Lecture hors-ligne + file d'attente pour les données de pratique, la dernière écriture l'emporte | Bon compromis valeur/complexité pour un seul utilisateur |
| D7 | Front | PWA React + Vite + PixiJS, **validée par le spike (D17)** | Une seule base de code ; la performance n'est pas un risque sur un Pixel 10 |
| D8 | Navigateurs | Firefox et Chromium ; MIDI sur Android à trancher en V2 (piste : Capacitor) | Firefox Android ne supporte pas Web MIDI |
| D9 | Import | Fichier et URL dans le MVP, Mutopia en V1.1, écran de vérification obligatoire | Beaucoup de MIDI ne séparent pas les mains |
| D10 | Progression | Réglages, boucles, temps de pratique, statut ; vitesse cible et tableau de bord plus tard | Mesurable sans MIDI ; la V2 enrichira les sessions |
| D11 | Son | Salamander allégé (environ 3 à 6 Mo), deux vélocités, sustain | Son réaliste, compatible avec le cache hors-ligne |
| D12 | Écran | Paysage, plein écran, Wake Lock, thème sombre ; zoom automatique remonté en V1.1 | Téléphone sur trépied à environ 50 cm |
| D13 | Licence | Dépôt public, licence MIT, codé « open source ready » | Portfolio |
| D14 | Couvertures | WebP 720×720 carré, sources MusicBrainz/CAA + Wikidata (gratuites, sans clé), choix validé par l'utilisateur à l'import | Les MIDI n'ont pas d'image ; le classique n'a pas d'album de référence → portrait du compositeur |
| D15 | Doc de la base | `docs/database.dbml` comme référence, généré à partir de Drizzle dès que le code existe | Plus lisible que Mermaid ; on évite que la doc diverge du code |
| D16 | Déploiement | Compose avec deux conteneurs : `web` (nginx, PWA) et `api` (Hono + SQLite) ; routage par chemin sur un seul domaine | Séparation front/back et déploiements indépendants, sans CORS ; pas de conteneur DB avec SQLite |
| D17 | Spike falling notes | **GO PWA**. Audio en Web Audio natif (sans Tone.js) ; synchro sur `currentTime − outputLatency − baseLatency` ; la pédale prolonge le son mais pas l'affichage | 60 FPS sur Chrome (PC et Pixel 10) et sur Firefox, synchro validée à l'écoute sur les deux. Tone.js plantait sous Firefox et masquait la latence, et `getOutputTimestamp()` ignore la latence sous Firefox |
| D18 | Pilote SQLite | `better-sqlite3` + Drizzle 0.45 stable | `node:sqlite` n'est supporté que par Drizzle 1.0, encore en RC. `better-sqlite3` fournit des binaires précompilés pour Node 26. À reconsidérer à la sortie de Drizzle 1.0 |
| D19 | Hachage des mots de passe | argon2id natif de `node:crypto` (Node 26) | Aucune dépendance native, paramètres conformes OWASP |
| D20 | Client HTTP du web | `fetch` typé par les schémas de `packages/contracts` (validation des réponses à l'exécution), au lieu du client RPC `hc` de Hono | `hc` importe le type de l'app serveur dans le web : violation de l'isolation des apps, et TypeScript devrait typer le code serveur (Node, Drizzle) dans un projet DOM. Les contrats couvrent déjà toutes les réponses |
| D21 | Lecteur | Contrôleur unique entre l'UI et le moteur, état affiché dans un store Zustand, runtime navigateur isolé (testable). Échantillons commités dans le dépôt (≈ 2 Mo, CC-BY). Zoom automatique par défaut sur téléphone (avancé de la V1.1). Un morceau pratiqué passe « en cours » | Testabilité sans Web Audio ni WebGL, aucune dépendance à un CDN, lisibilité sur un écran de 6 pouces |
| D22 | Déploiement et PWA | Images non root (nginx sans privilèges, Node `node`), CSP sans `unsafe-eval` (PixiJS en mode sans eval, zod `jitless`). Build des images et déploiement gérés dans l'interface de Dokploy, la CI ne fait que vérifier le code. Service Worker mis à jour automatiquement, au démarrage ou au changement de page suivant, jamais dans le lecteur | Un seul endroit pour le déploiement (Dokploy). Ne jamais recharger la page pendant la pratique, ni au milieu d'un formulaire ; sans bouton à cliquer, l'app reste à jour. Une faille XSS ne peut pas exécuter de code généré |
| D23 | Données hors-ligne | Le cache de TanStack Query est sauvegardé dans IndexedDB et restauré au démarrage, au lieu de copies par table (`songs`, `library`, `loops`). Dexie ne garde que les MIDI (avec la fiche du morceau) et l'outbox. Les écritures sont appliquées au cache puis envoyées par l'outbox (`PUT` seulement, un par chemin). Connectivité détectée par les échecs réseau et une sonde de l'API | Une seule source de vérité côté client, en ligne comme hors-ligne : les pages n'ont pas deux chemins de lecture. Moins de code de synchronisation, testable sans navigateur (`fake-indexeddb`) |
| D24 | Bibliothèques en ligne | Un **fournisseur par bibliothèque** (liste complète + MIDI), un index commun `source_pieces` recherché localement, une synchronisation par bibliothèque (Mutopia et xivmidi chaque semaine, MAESTRO chaque mois), écrite seulement si toute la liste a été lue. **Mutopia** : pages de liste du site (une par seconde). **MAESTRO** : CSV + archive de 58 Mo extraite une fois sur le serveur. **xivmidi** : données JSON intégrées aux pages de la bibliothèque (une par seconde). Morceaux à un seul MIDI. Recherche sur une colonne normalisée (accents, casse, ponctuation), pas FTS5. Écoute par le moteur du lecteur sans rendu, chargé au premier clic ; MIDI servi par l'API. Origine et crédit gardés sur le morceau (`source_library`, `source_piece_id`, `credit`), sans contrainte CHECK | Mutopia n'a ni API ni index, son RSS s'arrête en 2019. MuseScore exige une clé d'API et un compte Pro (prévu plus tard). Moins de 10 000 lignes : un `LIKE` suffit. Une contrainte CHECK nouvelle sur `songs` demanderait de reconstruire la table, ce qui, dans la transaction de migration, supprimerait en cascade pistes, boucles et sessions. La CSP interdit à la page de joindre les bibliothèques |
| D25 | Confort du lecteur | Grille de temps calculée dans `core` depuis le tempo et la mesure du MIDI. Clics synthétisés, programmés sur l'horloge audio par le scheduler. Décompte par décalage de l'ancre de l'horloge (les notes descendent pendant le décompte). Volume par main dans `hands_settings` (synchronisé par morceau). Décompte, métronome et nom des notes en préférences de l'appareil (`localStorage`) | Une seule horloge (D17) : le métronome reste calé sur les notes à toutes les vitesses. Aucun échantillon à télécharger. Les préférences de confort dépendent de l'appareil, pas du morceau |
| D26 | Progression | Meilleure vitesse d'une boucle = jouée 3 tours de suite ; proposition de +5 % après 5 tours, jusqu'à la cible. Historique renvoyé brut par l'API (`GET /practice-sessions`), regroupé par jour et par semaine côté client. Histogramme en HTML accessible (boutons, infobulle, tableau), sans librairie de graphiques | Sans entrée MIDI, le seul signal fiable est d'aller au bout de la boucle. Les jours dépendent du fuseau horaire de l'appareil, que le serveur ne connaît pas. Une librairie de graphiques pour un seul histogramme alourdirait le bundle |
| D27 | Lecteur épuré | Seuls lecture, ±5 s, la progression et trois boutons (plein écran, Réglages, Boucles) restent à l'écran. Vitesse, mains et zoom passent dans Réglages ; A, B et boucle on/off dans Boucles. La progression est posée sur le bord du clavier. Un panneau ouvert garde les contrôles affichés | Ces réglages se font une fois par session : affichés en permanence, ils encombraient l'écran au-dessus des notes et masquaient le bouton lecture sur téléphone | 
| D28 | Mains note par note | Un algorithme déterministe dans `core` (recherche en faisceau, coûts de déplacement, d'écart, de doigts, de croisement et de registre, réglés sur un corpus Mutopia) donne une main à chaque note. Le résultat est calculé une fois, à l'import ou sur demande, et enregistré par morceau (`song_hands`) avec l'empreinte des notes. Il est corrigeable note par note sur PC. Le MIDI d'origine n'est jamais réécrit | Les modèles entraînés publiés (~91 %) dépendent d'un jeu de données réservé à la recherche (PIG), pour quelques points de plus que notre 92,4 %. Recalculer à chaque lecture changerait une bonne répartition à chaque évolution de l'algorithme. Réécrire le MIDI casserait le dédoublonnage par empreinte et perdrait les autres instruments (V1.4) |
| D29 | Multi-utilisateur | Comptes créés seulement par lien d'invitation de l'administrateur (usage unique, 7 jours, jeton haché), pas d'inscription ouverte. Deux rôles, `admin` (le compte initial) et `member`. Catalogue commun ; modification et suppression d'un morceau par celui qui l'a importé ou l'administrateur. Mot de passe oublié : lien de réinitialisation créé par l'administrateur (pas d'e-mail). Comptes désactivés plutôt que supprimés. Sur un appareil partagé, le cache est vidé quand un autre compte se connecte, et chaque écriture en attente ne part qu'avec la session de son auteur | Instance privée pour un cercle restreint : pas de serveur d'e-mails, l'administrateur transmet les liens lui-même. Un catalogue commun évite d'importer deux fois le même fichier (dédoublonnage par empreinte). Supprimer un compte casserait les morceaux qu'il a importés (`created_by`). Sans étiquette d'auteur, une écriture restée hors-ligne partirait avec la session d'un autre compte |
| D30 | Écoute au micro | Vérification guidée par la partition plutôt que transcription libre : le lecteur sait quelles notes il attend, et pour chacune vérifie dans le spectre (FFT de 8192 points, harmoniques pondérées) qu'elle bat ses voisins d'un demi-ton, que ses harmoniques impaires sont là (sinon c'est l'octave au-dessus) et qu'aucune octave en dessous ne l'explique, une fois retirées les harmoniques des autres notes attendues. Code pur dans `core/listening`, micro brut par AudioWorklet (sans annulation d'écho, réduction de bruit ni gain automatique) | Aucun modèle de transcription ne tourne en temps réel au micro dans un navigateur (Basic Pitch traite des fichiers). La transcription libre entend 2 à 4 fausses notes par trame ; la vérification d'un accord connu est bien plus fiable et suffit au mode attente. Pas de modèle à télécharger, pas de dépendance |

## 8. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Décalage entre le son et l'image | ~~Fort~~ Faible | Horloge unique (horloge audio) avec compensation de `outputLatency` : **validée au spike** sur Chrome et Firefox (D17) |
| MIDI mal structuré (mains non séparées, pistes parasites) | Moyen | Écran de vérification, séparation automatique (pistes, sinon découpage par hauteur), mapping modifiable |
| Pas de Web MIDI dans Firefox Android (V2) | Moyen | Couche d'entrée abstraite ; wrapper Capacitor avec plugin MIDI natif, ou Chrome dédié |
| Firefox PC ne permet plus d'installer de PWA | Faible | Utilisation en onglet ou raccourci ; le hors-ligne reste assuré par le Service Worker |
| Droits d'auteur sur les MIDI | Faible (usage privé) | Instance privée, rien de protégé dans le dépôt, champ `license` renseigné |
| Dérive de qualité du code généré par IA | Moyen | Conventions écrites (`06-conventions.md`), tâches de la taille d'une PR, revue systématique, CI stricte |

## 9. Glossaire

- **Falling notes** : visualisation où chaque note est un rectangle qui descend vers la touche à jouer. Sa longueur correspond à sa durée.
- **MIDI** : format décrivant des événements musicaux (note on/off, hauteur, vélocité), pas du son.
- **Piste / canal** : deux niveaux d'organisation dans un MIDI, qui servent à attribuer les notes aux mains.
- **Vélocité** : force de frappe (0 à 127).
- **Sustain (CC64)** : pédale qui prolonge les notes.
- **Boucle A-B** : passage délimité, rejoué en boucle.
- **Vitesse (%)** : facteur appliqué au tempo d'origine. 50 % = deux fois plus lent, à hauteur de notes identique.
- **Temps de partition** : position en millisecondes à 100 % de vitesse. C'est la référence pour stocker positions et boucles.
