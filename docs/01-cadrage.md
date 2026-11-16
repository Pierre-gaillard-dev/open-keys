# Open Keys — Note de cadrage

> Statut : validé à l'issue de la session de cadrage (« grill-me ») du 2026-11-16.

## 1. Vision

Une application personnelle pour **apprendre le piano sans savoir lire une partition**, en mode *falling notes* : les notes tombent vers un clavier virtuel, à la manière des tutos YouTube. L'application lit des fichiers **MIDI** issus d'un catalogue personnel hébergé sur un serveur, et fonctionne sur **Android, Windows 11 et Ubuntu**.

## 2. Contexte

| Élément | Valeur |
|---|---|
| Utilisateur | Une seule personne (l'auteur), développeur, sans connaissance du solfège |
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
- **Authentification** mono-utilisateur, avec un modèle de données prêt pour plusieurs utilisateurs.

### Plus tard, par ordre de priorité
1. Zoom automatique du clavier sur la plage de notes utilisée (**V1.1**)
2. Recherche et import depuis **Mutopia** (V1.1)
3. Décompte avant le départ
4. Nom des notes, en notation anglaise (C, D, E…)
5. Métronome
6. Volume par main
7. Vitesse cible par boucle et tableau de bord de pratique
8. **V2 — entrée MIDI** : vérification des notes, mode attente, score, pause avec une touche du piano
9. Gamification (séries de jours, objectifs)

## 6. Contraintes

- **Une seule base de code** pour les trois plateformes.
- **Firefox** est le navigateur principal, sur PC comme sur Android. Tout doit aussi être testé sur Chromium.
- HTTPS obligatoire (PWA, Service Worker, Wake Lock).
- Déploiement via Dokploy : **deux conteneurs** (`web` nginx + `api` Hono) orchestrés par un `docker-compose`, sur un seul domaine. Un volume persistant pour SQLite et les fichiers ; pas de conteneur de base de données.
- Pas de secrets ni de contenu protégé dans le dépôt. Les attributions de licence sont respectées (échantillons Salamander en CC-BY).

## 7. Décisions

| # | Sujet | Décision | Pourquoi |
|---|---|---|---|
| D1 | Entrée | MVP « regarder et écouter » ; MIDI en V2 derrière une couche « source d'entrée » abstraite | Pas de câble pour l'instant ; on évite de tout refaire plus tard |
| D2 | Fonctions du lecteur | Notes qui tombent + clavier, vitesse, boucle A-B, une main à la fois, barre de progression | Sans retour du clavier, la valeur vient des outils de contrôle de la lecture |
| D3 | Utilisateurs | Un seul, avec `users` et `user_id` partout | Passer à quelques comptes sans migration douloureuse |
| D4 | Hébergement | VPS OVH existant, Dokploy, Docker | Infrastructure déjà en place, coût nul |
| D5 | Backend | Hono + Drizzle + SQLite, monorepo pnpm en TypeScript | Logique métier spécifique (MIDI), types partagés de bout en bout |
| D6 | Hors-ligne | Lecture hors-ligne + file d'attente pour les données de pratique, la dernière écriture l'emporte | Bon compromis valeur/complexité pour un seul utilisateur |
| D7 | Front | PWA React + Vite + PixiJS, validée par un spike | Une seule base de code ; la performance n'est pas un risque sur un Pixel 10 |
| D8 | Navigateurs | Firefox et Chromium ; MIDI sur Android à trancher en V2 (piste : Capacitor) | Firefox Android ne supporte pas Web MIDI |
| D9 | Import | Fichier et URL dans le MVP, Mutopia en V1.1, écran de vérification obligatoire | Beaucoup de MIDI ne séparent pas les mains |
| D10 | Progression | Réglages, boucles, temps de pratique, statut ; vitesse cible et tableau de bord plus tard | Mesurable sans MIDI ; la V2 enrichira les sessions |
| D11 | Son | Salamander allégé (environ 3 à 6 Mo), deux vélocités, sustain | Son réaliste, compatible avec le cache hors-ligne |
| D12 | Écran | Paysage, plein écran, Wake Lock, thème sombre ; zoom automatique remonté en V1.1 | Téléphone sur trépied à environ 50 cm |
| D13 | Licence | Dépôt public, licence MIT, codé « open source ready » | Portfolio |
| D14 | Couvertures | WebP 720×720 carré, sources MusicBrainz/CAA + Wikidata (gratuites, sans clé), choix validé par l'utilisateur à l'import | Les MIDI n'ont pas d'image ; le classique n'a pas d'album de référence → portrait du compositeur |
| D15 | Doc de la base | `docs/database.dbml` comme référence, généré à partir de Drizzle dès que le code existe | Plus lisible que Mermaid ; on évite que la doc diverge du code |
| D16 | Déploiement | Compose avec deux conteneurs : `web` (nginx, PWA) et `api` (Hono + SQLite) ; routage par chemin sur un seul domaine | Séparation front/back et déploiements indépendants, sans CORS ; pas de conteneur DB avec SQLite |

## 8. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Décalage entre le son et l'image | Fort | Horloge unique (horloge audio) avec compensation de `outputLatency`, validée au spike |
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
