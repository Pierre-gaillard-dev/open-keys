# Spike — falling notes (phase 0)

Prototype **jetable** pour valider la PWA sur la cible réelle (décision D7). Il vit sur la branche `spike/falling-notes`, qui ne sera jamais mergée. Seuls les enseignements sont reportés dans `docs/`.

Il contient : le parsing MIDI (`@tonejs/midi`), les mains par piste (sinon découpage à C4), la pédale de sustain (sur le son uniquement), le rendu PixiJS (pool de sprites, aucune allocation par image), le son Tone.js Sampler (Salamander), **une horloge unique** (l'horloge audio) avec trois modes de compensation de la latence, la vitesse (50, 75 ou 100 %), une boucle de 8 s, le zoom automatique, le plein écran et un HUD de mesures.

## Lancer

```bash
pnpm --filter @open-keys/spike dev     # écoute sur le réseau local (--host)
```

- **PC** : http://localhost:5173
- **Pixel 10** : même Wi-Fi, ouvrir `http://<ip-du-pc>:5173` dans Firefox (l'IP est affichée par Vite dans « Network »).
- Les échantillons de piano viennent du CDN de Tone.js : il faut une connexion internet.

## Protocole de test

Pour chaque appareil, avec l'**Étude op. 10 n°1** (le cas dense) :

1. **Plein écran**, téléphone en paysage, contrôles masqués (bouton « Masquer »).
2. **Fluidité** : 30 s de lecture à 100 %, relever dans le HUD `FPS`, `rendu … (pire …)` et `images > 25 ms`.
3. **Synchro** : à 100 % puis à 50 %, en regardant les notes toucher le clavier.
   - Essayer les 3 modes `Sync` et garder celui qui « colle » le mieux.
   - Ajuster `Décalage` jusqu'à ce que le son et l'image soient simultanés, puis noter la valeur (idéalement proche de 0).
4. **Boucle** : activer « Boucle 8 s », laisser tourner 10 boucles et vérifier qu'il n'y a pas de dérive.
5. **Démarrage** : recharger la page (échantillons en cache), appuyer sur Lecture et chronométrer jusqu'au premier son.
6. Refaire un passage avec le **Nocturne** (cas courant) et avec le **zoom auto**.

## Résultats

| Appareil / navigateur | FPS (min) | Pire rendu | Images > 25 ms / 30 s | outputLatency | Mode sync retenu | Décalage | Synchro perçue | Démarrage |
|---|---|---|---|---|---|---|---|---|
| Pixel 10 — Firefox | | | | | | | | |
| Ubuntu — Firefox | | | | | | | | |
| Windows 11 — Firefox | | | | | | | | |
| Ubuntu — Chromium | | | | | | | | |

**Critères GO** (roadmap, phase 0) : ≥ 55 fps en continu, aucun décalage perceptible, démarrage < 2 s.

## Premières mesures (Chrome headless, rendu logiciel, sans GPU)

Elles ne sont pas représentatives des FPS : le rendu passe par le CPU, sans carte graphique. Elles valident seulement la mécanique :
- coût de rendu d'une image ≈ **0,1 ms** sur le morceau dense (environ 35 notes à l'écran) ;
- la position avance en temps réel, et l'écart programmé/entendu (≈ 45 à 70 ms) correspond à la latence de sortie compensée ;
- la vitesse, la boucle et la pédale fonctionnent.

## Crédits

- *Étude op. 10 n°1*, F. Chopin : [Mutopia Project](https://www.mutopiaproject.org/), domaine public.
- *Nocturne op. 9 n°2*, F. Chopin : [Mutopia Project](https://www.mutopiaproject.org/), CC BY-SA 3.0.
- Échantillons : Salamander Grand Piano (Alexander Holm, CC-BY 3.0), servis par Tone.js.
