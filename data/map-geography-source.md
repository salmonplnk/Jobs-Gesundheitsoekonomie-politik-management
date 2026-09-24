# Geografische Grundlage der Arbeitgeberkarte

Abruf: 22. September 2026. Die Anwendung enthält die Daten lokal und ruft beim Anzeigen der Karte keine Kartendienste, Geocoder oder Tile-APIs auf.

## Landesgrenze

- Datensatz: Natural Earth, **Admin 0 – Countries, 1:10m**, Feature `ADMIN = Switzerland` / `ISO_A3 = CHE`.
- [Produktseite](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/)
- [Originaldatei im Projekt-Repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson)
- [GeoJSON-Download](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson)
- SHA-256 der heruntergeladenen vollständigen GeoJSON-Datei: `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`.
- Lizenz: [Public Domain](https://www.naturalearthdata.com/about/terms-of-use/).

Alle 749 Punkte des einen Schweizer Polygons bleiben erhalten. Nur die projizierten SVG-Koordinaten wurden auf zwei Nachkommastellen gerundet. Die Grenze ist für eine landesweite Übersicht generalisiert; sie ist kein amtlicher Grenznachweis. Es wurden keine Kantonsgrenzen erfunden.

## Ortsanker

Quelle: **© swisstopo**, geografische Namenssuche von geo.admin.ch, Objektklasse `TLM_SIEDLUNGSNAME`. Ortsanker sind repräsentative Siedlungspositionen; sie sind keine Koordinaten einzelner Arbeitgeber, Kantonsmittelpunkte oder Angaben zur Erreichbarkeit.

- API: `https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=<Ort>&type=locations&origins=gazetteer&limit=20`
- Auswahl nach dem exakten hervorgehobenen Ortsnamen und `objectclass = TLM_SIEDLUNGSNAME`. Bei Zug wurde zusätzlich der Kanton ZG geprüft; Altdorf verwendet ausdrücklich **Altdorf UR**, nicht Altdorf SH, Vitznau oder eine Autobahnausfahrt.
- Die Werte `attrs.lon` und `attrs.lat` wurden auf sechs Nachkommastellen gerundet.
- [Nutzungsbedingungen](https://www.swisstopo.admin.ch/en/conditions-geodata)
- [Quellenangabe](https://www.swisstopo.admin.ch/en/source-reference-ogd-swisstopo). Die sichtbare Karte nennt deshalb «Orte: © swisstopo».

| Filtername | Suchname | Gazetteer-Datensatz-ID | Längengrad | Breitengrad |
| --- | --- | ---: | ---: | ---: |
| Bern | Bern | 248095 | 7.437128 | 46.948997 |
| Zürich | Zürich | 413178 | 8.530146 | 47.383949 |
| Basel | Basel | 275727 | 7.592385 | 47.557598 |
| Luzern | Luzern | 413052 | 8.305033 | 47.051125 |
| Winterthur | Winterthur | 165736 | 8.732653 | 47.500164 |
| St. Gallen | St. Gallen | 193237 | 9.366549 | 47.423393 |
| Solothurn | Solothurn | 164994 | 7.532872 | 47.208977 |
| Aarau | Aarau | 191770 | 8.049969 | 47.391338 |
| Neuenburg | Neuchâtel | 413967 | 6.929543 | 46.995129 |
| Chur | Chur | 304000 | 9.524787 | 46.855785 |
| Zug | Zug | 302499 | 8.513067 | 47.172802 |
| Frauenfeld | Frauenfeld | 356690 | 8.896826 | 47.559269 |
| Schwyz | Schwyz | 386637 | 8.653757 | 47.023064 |
| Altdorf | Altdorf | 82293 | 8.638636 | 46.878326 |
| Appenzell | Appenzell | 165051 | 9.408989 | 47.331543 |
| Herisau | Herisau | 81606 | 9.277903 | 47.386551 |

**Westschweiz** ist ein bestehender Sammelfilter über mehrere Orte und erhält bewusst keinen scheinbar exakten Stadtmarker. **Neuenburg** verwendet den Siedlungspunkt von Neuchâtel.

## Projektion und Wiederherstellung

`js/map-geography.js` stellt `globalThis.SWISS_MAP_GEOGRAPHY` bereit:

- `viewBox`, `width`, `height`: `0 0 900 560`, 900, 560.
- `bounds`: West 5.9°, Ost 10.6°, Süd 45.7°, Nord 47.95°.
- `project(lon, lat)`: gibt `{ x, y }` im selben Koordinatensystem wie `countryPath` zurück.
- `locations`: Objekte mit `id`, `lon`, `lat` für die vorhandenen Stadtfilter.

Äquidistante Zylinderprojektion mit Standardparallele 46.8° N und gemeinsamem Massstab für beide Achsen:

```js
const cos = Math.cos(46.8 * Math.PI / 180);
const scale = Math.min((900 - 64) / ((10.6 - 5.9) * cos), (560 - 64) / (47.95 - 45.7));
const x = 450 + (lon - 8.25) * cos * scale;
const y = 280 + (46.825 - lat) * scale;
```

Zur Regeneration die Quelldatei herunterladen, das Schweizer Feature auswählen, jeden Punkt jedes Polygonrings mit dieser Formel projizieren und mit zwei Nachkommastellen als `M…L…Z` verbinden. Die Stadtanker unverändert durch dieselbe `project`-Funktion führen. Verschobene Beschriftungen dürfen zur Lesbarkeit eine Verbindungslinie erhalten; der eigentliche Ortsanker bleibt geografisch korrekt.
