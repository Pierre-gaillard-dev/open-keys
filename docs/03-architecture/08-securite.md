# Open Keys — Architecture : Sécurité

[← Sommaire](./README.md)

- Cookies `httpOnly`, `Secure`, `SameSite=Lax`, avec vérification de l'en-tête `Origin` sur les requêtes qui modifient des données.
- Hash des mots de passe en argon2id, rate-limit sur `/auth/login`.
- Import par URL : seulement http/https, résolution DNS puis refus des IP privées et locales, délai maximal de 10 s, 2 Mo maximum, 3 redirections au plus.
- Les URL de couverture passent par le même `safe-fetch`, avec 10 Mo maximum en entrée. sharp valide le format (JPEG, PNG, WebP, AVIF) et **ré-encode** toujours l'image : aucun fichier d'origine n'est servi, et les métadonnées EXIF sont supprimées.
- Appels à MusicBrainz : `User-Agent` identifiant l'app (`OpenKeys/<version> ( <MUSICBRAINZ_CONTACT> )`, contact fourni par variable d'environnement), 1 requête par seconde maximum, résultats mis en cache.
- Fichiers stockés sous le nom de leur hash : aucun chemin fourni par l'utilisateur n'est utilisé.
- En-têtes de sécurité : CSP stricte, `X-Content-Type-Options`.
