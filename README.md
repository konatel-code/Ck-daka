# 🌴 CK Daka – Sprievodca výberom zájazdov

Hravá webová aplikácia, ktorá z **aktuálnej ponuky CK Daka** (XML feed
`https://www.ckdaka.sk/export/xml`) podľa zadania klienta odporučí ten
najvhodnejší zájazd.

Kombinuje **vtipného sprievodcu (kvíz)** s **detailnými filtrami** pre náročných.

## ✨ Čo to vie

- 🎯 **Sprievodca na mieru** – pár otázok (nálada, s kým, rozpočet, termín, dĺžka,
  doprava) a appka spočíta **% zhody** každého zájazdu so zadaním a zoradí ponuku.
- ⚙️ **Detailné filtre** – krajina, typ dovolenky, doprava, cena, mesiac, fulltext.
- 🔄 **Živý feed** – server načítava a kešuje XML (15 min), takže obíde CORS.
- 🧩 **Flexibilný normalizér** – poradí si s rôznymi názvami polí v reálnom XML
  (`src/normalizer.js`), typ dovolenky a dopravu vie odvodiť aj z textu.

## 🚀 Spustenie

```bash
npm install
npm start          # http://localhost:3000
```

Konfigurácia cez premenné prostredia:

| Premenná        | Default                              | Popis                          |
|-----------------|--------------------------------------|--------------------------------|
| `PORT`          | `3000`                               | port servera                   |
| `DAKA_FEED_URL` | `https://www.ckdaka.sk/export/xml`   | zdroj XML ponuky               |
| `FEED_TTL_MS`   | `900000` (15 min)                    | doba platnosti cache feedu     |

> 💡 Ak je živý feed nedostupný (napr. obmedzená sieť), server automaticky
> zobrazí **ukážkové dáta** z `data/sample.xml`, aby appka vždy bežala. Stav
> zdroja vidíš v pravom hornom rohu („naživo" / „ukážka").

## 🎨 Farby značky

Celá paleta je na jednom mieste – v hlavičke `public/css/styles.css` v bloku
`:root`. Po dodaní loga sem stačí vložiť presné HEX kódy a appka sa preladí.

## 🗂️ Štruktúra

```
server.js              # Express server, fetch + cache feedu, API
src/normalizer.js      # parsovanie a normalizácia XML, číselníky pre filtre
data/sample.xml        # ukážková vzorka štruktúry feedu (pre vývoj)
public/
  index.html           # UI – hero, sprievodca, výsledky, detail
  css/styles.css       # štýly + farebná paleta (CSS premenné)
  js/app.js            # logika sprievodcu, matchovací algoritmus, render
```

## 🔌 API

- `GET /api/tours` – normalizované zájazdy + číselníky pre filtre
- `GET /api/refresh` – vynúti znovunačítanie feedu
- `GET /api/health` – stav servera a cache
