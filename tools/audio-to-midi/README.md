# Audio → MIDI (spike)

Ces outils transforment un enregistrement de **piano seul** (mp3, opus, m4a, wav…) en MIDI que l'app sait importer : notes, pédale de sustain et grille de temps. C'est un spike (décision D34) : ces outils ne font pas partie de l'app.

> Ne jamais commiter un enregistrement ni la transcription d'une œuvre sous droits. On les traite en local, dans un dossier hors du dépôt.

## Résultats (novembre 2026)

Le premier essai porte sur une reprise piano de 4 min 25 (« One More Light », tutoriel de piano seul), traitée sur un PC à 4 cœurs, sur le CPU uniquement.

| | ByteDance (piano) | Basic Pitch (tous instruments) |
|---|---|---|
| Temps de calcul | 8 min 40 (2× la durée) | 13 s |
| Notes | 1 404, de Fa1 à Mib6 | 1 824 |
| Pédale | 231 appuis, appliqués au son par l'app | non |
| Accord avec ByteDance (F1, attaques à ±50 ms) | référence | 0,68 |
| Notes en trop par rapport à ByteDance | – | 40 % |
| Fidélité au son d'origine | 0,853 | 0,854 |

La fidélité au son d'origine est mesurée en rejouant chaque MIDI avec les échantillons Salamander, puis en comparant son spectrogramme à celui de l'enregistrement. Un témoin volontairement faux (décalé d'un demi-ton) donne 0,561.

- **Basic Pitch** ajoute beaucoup de notes qui n'existent pas, plus douces et plus courtes que les vraies :
  - 295 fantômes à l'octave ou à la douzième d'une note jouée ;
  - 194 notes coupées en deux ou rejouées ;
  - il rate aussi des octaves réellement jouées, qu'il prend pour des harmoniques.
  
  Ces défauts gênent peu à l'écoute (la fidélité est égale), mais beaucoup en notes qui tombent : on les verrait toutes.
- **ByteDance** est nettement plus propre : c'est un modèle spécialisé piano, qui obtient 97 % de bonnes notes sur le jeu de données MAESTRO. Il est en revanche lent sur le CPU.
- **Grille de temps** : le battement détecté (librosa) donne 83,4 BPM, très régulier. 93 % des attaques tombent sur un temps ou un demi-temps, contre 57 % avec la grille par défaut à 120 BPM. Écrite dans le MIDI comme un changement de tempo par temps, elle fait suivre la musique aux mesures, au métronome et au décompte de l'app. Les notes ne bougent pas, à 1 ms près. Le premier temps de la mesure n'est pas détecté : la mesure à 4 temps commence au début du morceau.

## Utilisation

```sh
python3 -m venv venv
./venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
./venv/bin/pip install -r requirements.txt
./venv/bin/pip install --no-deps basic-pitch   # pour la comparaison seulement

# Modèle de ByteDance (172 Mo), chargé par PyTorch en mode sûr (poids seulement)
curl -L -o bytedance.pth "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"

./venv/bin/python transcribe.py enregistrement.opus sortie.mid --checkpoint bytedance.pth
./venv/bin/python transcribe_basic_pitch.py enregistrement.opus basic_pitch.mid
./venv/bin/python compare.py enregistrement.opus sortie.mid basic_pitch.mid
```

Le MIDI produit s'importe dans l'app comme n'importe quel fichier. La séparation des mains se fait à l'import (D28).

## Licences

- `piano_transcription_inference` (Qiuqiang Kong, ByteDance) : Apache-2.0. **Licence du modèle publié sur Zenodo à vérifier avant tout usage en production.**
- Basic Pitch (Spotify) : Apache-2.0.
- librosa : ISC. mido : MIT.
