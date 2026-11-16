# Open Keys — Architecture : Contexte et vue d'ensemble

[← Sommaire](./README.md)

## Contexte

Qui parle à qui, sans détail interne.

```mermaid
flowchart LR
  U(["🧑 Pianiste"])
  K["🎹 Yamaha P-120<br/>(V2, via USB-MIDI)"]
  APP["📱 Application Open Keys<br/>PWA : Android, Windows, Ubuntu"]
  API["🖥️ Backend Open Keys<br/>API + base + fichiers<br/>(VPS, Dokploy)"]

  subgraph EXT["Sources externes"]
    URL["URL de MIDI quelconque"]
    MUT["Mutopia<br/>(V1.1)"]
    MB["MusicBrainz +<br/>Cover Art Archive"]
    WD["Wikidata /<br/>Wikimedia Commons"]
  end

  U -->|utilise| APP
  K -.->|notes jouées| APP
  APP -->|HTTPS| API
  API -->|télécharge les MIDI| URL
  API -->|indexe et télécharge les MIDI| MUT
  API -->|cherche des pochettes| MB
  API -->|cherche des portraits de compositeurs| WD
```

Seul le backend contacte les sources externes. L'application ne parle qu'au backend : pas de problème de CORS, et la protection SSRF, les limites et le cache sont gérés à un seul endroit.

## Vue d'ensemble

```mermaid
flowchart TB
  subgraph Client["PWA (Firefox / Chromium) — Android, Windows, Ubuntu"]
    UI[React UI<br/>catalogue, import, réglages]
    PL[Player engine<br/>Transport + Scheduler]
    RD[Renderer PixiJS]
    AU[Audio Tone.js Sampler]
    IN[InputSource<br/>V2 : Web MIDI / natif]
    IDB[(IndexedDB<br/>Dexie : MIDI, état, outbox)]
    SW[Service Worker<br/>shell + échantillons]
  end

  subgraph Server["Conteneur unique — Dokploy sur VPS OVH"]
    API[API Hono]
    CORE[packages/core<br/>analyse MIDI, mains]
    DB[(SQLite<br/>Drizzle)]
    FS[(Volume /data/midi)]
    STATIC[Fichiers statiques de la PWA]
  end

  EXT[Sources externes<br/>URL, Mutopia]

  UI --> PL --> RD
  PL --> AU
  IN -.V2.-> PL
  UI <--> IDB
  UI <-->|HTTPS, client RPC typé| API
  API --> CORE
  API --> DB
  API --> FS
  API --> EXT
  STATIC --> Client
```
