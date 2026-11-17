# Open Keys — Architecture : Sécurité

[← Sommaire](./README.md)

- Cookies `httpOnly`, `Secure`, `SameSite=Lax`, avec vérification de l'en-tête `Origin` sur les requêtes qui modifient des données.
- **Mots de passe** : argon2id (`node:crypto`, 64 Mio, 3 passes), stockés au format PHC. Pour un identifiant inconnu, le mot de passe est quand même vérifié contre un hash factice, pour que le temps de réponse ne révèle pas quels comptes existent. Le message d'erreur est identique dans les deux cas.
- **Limite de connexion** : 5 échecs par 15 minutes et par (IP, identifiant), puis 429 avec `Retry-After`. L'IP vient de `X-Forwarded-For` seulement si `TRUST_PROXY=true` (derrière Traefik).
- **Sessions** : jeton aléatoire de 256 bits ; seul son SHA-256 est stocké. Expiration glissante de 90 jours, prolongée au plus une fois par jour. Cookie `httpOnly`, `SameSite=Lax`, `Secure` en production. Purge des sessions expirées par la maintenance.
- **Routes protégées par préfixe** (voir `06-api.md`). L'identifiant d'une ressource créée côté client (boucle, session) qui appartient à un autre utilisateur est traité comme introuvable : jamais écrasé, jamais révélé.
- Import par URL (`shared/http/safe-fetch.ts`) : seulement http/https sans identifiants dans l'URL, 3 redirections au plus (chacune revalidée), délai maximal de 10 s, 2 Mo maximum (contrôlés aussi pendant le téléchargement). **Seules les adresses unicast publiques sont autorisées**, et elles sont vérifiées **au moment de la connexion** (`lookup` de l'`Agent` undici), ce qui couvre aussi le DNS rebinding. Les IP écrites en dur dans l'URL sont vérifiées avant. Testé contre `127.0.0.1`, `localhost`, `::1`, `169.254.169.254`, `10.x`, `fd00::`, `::ffff:127.0.0.1` et un DNS truqué.
- Les URL de couverture passent par le même `safe-fetch`, avec 10 Mo maximum en entrée. sharp valide le format (JPEG, PNG, WebP, AVIF) et **ré-encode** toujours l'image : aucun fichier d'origine n'est servi, et les métadonnées EXIF sont supprimées.
- Appels à MusicBrainz : `User-Agent` identifiant l'app (`OpenKeys/<version> ( <MUSICBRAINZ_CONTACT> )`, contact fourni par variable d'environnement), 1 requête par seconde maximum, résultats mis en cache.
- Fichiers stockés sous le nom de leur hash : aucun chemin fourni par l'utilisateur n'est utilisé.
- En-têtes de sécurité : CSP stricte (nginx, pour les pages). `img-src` doit autoriser `coverartarchive.org`, `*.archive.org` et `upload.wikimedia.org` : les vignettes des suggestions de couverture sont chargées directement par le navigateur (`referrerpolicy=no-referrer`), et `secureHeaders()` de Hono sur l'API (`X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, etc.).
- Les erreurs inattendues ne renvoient jamais leur message ni leur pile au client. Le détail ne figure que dans les logs, retrouvable grâce au `requestId`.
