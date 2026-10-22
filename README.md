# Schafkopf Tracker

Offline-faehige PWA zum Erfassen und Auswerten eines Schafkopf-Spielabends. Optional kann ein Spielstand ueber Cloud Firestore in Echtzeit zwischen mehreren Geraeten synchronisiert werden.

## Online-Modus mit Firebase einrichten

Der Online-Modus ist standardmaessig deaktiviert. Ohne Firebase-Konfiguration arbeitet die App wie bisher ausschliesslich lokal.

1. In der [Firebase-Konsole](https://console.firebase.google.com/) ein Projekt und darin eine Web-App anlegen.
2. Cloud Firestore fuer das Projekt aktivieren.
3. Unter **Authentication > Sign-in method** die anonyme Anmeldung aktivieren.
4. Den Inhalt von [`firebase.rules`](firebase.rules) als Firestore-Regeln veroeffentlichen. Die Datei enthaelt die gemeinsamen Regeln fuer Schafkopf und Smash Bingo (Pool, Rundenergebnisse und manuelle Korrekturen). Bei spaeteren Aenderungen die Bereiche beider Apps erhalten; eine Veroeffentlichung ersetzt das gesamte aktive Regelwerk.
5. Die Webkonfiguration der Firebase-App entweder:
   - in der App unter **Einstellungen > Online** einfuegen, oder
   - dauerhaft in [`src/firebaseConfig.js`](src/firebaseConfig.js) eintragen.

Die Konfiguration sieht ungefaehr so aus:

```js
window.SCHAFKOPF_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "dein-projekt.firebaseapp.com",
  projectId: "dein-projekt",
  storageBucket: "dein-projekt.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

Die Firebase-Webkonfiguration ist kein Admin-Schluessel und darf mit der Web-App ausgeliefert werden. Der Schutz der Daten erfolgt durch Authentication und die Firestore-Regeln. Niemals Service-Account- oder Admin-Schluessel in dieses Repository eintragen.

## Gemeinsame Runde starten

1. Auf dem ersten Geraet **Einstellungen > Online > Neuen Raum erstellen** waehlen.
2. Auf weiteren Geraeten **Einstellungen > Online > Offene Runden** oeffnen und bei der gewuenschten Runde **Beitreten** waehlen. Die Liste zeigt Spielernamen, Spielanzahl und die letzte Aktivitaet und aktualisiert sich automatisch.
3. Alternativ den angezeigten fuenfstelligen Raumcode unter **Raum beitreten** eingeben. Aeltere zehnstellige Raumcodes werden ebenfalls unterstuetzt.

Unter **Offene Runden > Schliessen / loeschen** kann jede Runde nach zwei getrennten Sicherheitsabfragen endgueltig aus Firebase geloescht werden. Verbundene Geraete beenden dann die Synchronisierung und behalten ihren lokalen Spielstand. **Online-Raum verlassen** trennt dagegen nur das eigene Geraet und laesst die Online-Runde offen. Alle in `schafkopfRooms` vorhandenen Dokumente gelten als offene Runden, auch bereits frueher angelegte.

Fuer diese Funktionen muessen die aktuellen Regeln aus [`firebase.rules`](firebase.rules) in Firebase veroeffentlicht werden (Firebase-Konsole oder `firebase deploy --only firestore:rules --project smashbingo`). Die Datei enthaelt die gemeinsamen Regeln fuer Schafkopf und SmashBingo: Die bestehenden Zugriffe auf den gemeinsamen Bingo-Pool, die Rundenergebnisse und die manuellen Ranglisten-Korrekturen bleiben erhalten. Im Schafkopf-Bereich erlauben die Regeln allen anonym angemeldeten App-Nutzern, offene Runden aufzulisten, zu lesen, zu bearbeiten und zu loeschen. Die beiden Sicherheitsabfragen erfolgen in der App. Alle weiteren Pfade bleiben gesperrt.

Synchronisiert werden Runden, Spieler, Kartenstrafen, Austeil-Bewertungen, Tarife, Spielarten, 5-Spieler-Modus sowie Ramsch- und Bock-Regeln. Theme, Runenmodus, Navigation und ein gerade noch nicht gespeichertes Eingabeformular bleiben geraetespezifisch.

Beim Beitritt (auch beim automatischen Wiederverbinden) ersetzt der aktuelle Server-Spielstand alle lokalen Sitzungsdaten. Ein offenes Eingabeformular wird verworfen. Lokale Daten werden dabei weder hochgeladen noch mit dem Raum zusammengefuehrt. Erst nach der vollstaendigen Uebernahme werden neue Aenderungen synchronisiert; ohne Serververbindung wird der Beitritt nicht abgeschlossen.

Bei parallelen Aenderungen verwendet die App Firestore-Transaktionen und eine Drei-Wege-Zusammenfuehrung. Gleichzeitig neu erfasste Runden bleiben dadurch erhalten. Wenn exakt dieselbe bestehende Runde gleichzeitig auf zwei Geraeten bearbeitet wird, gewinnt die zuletzt erfolgreich synchronisierte Bearbeitung.

Waehrend einer bestehenden Verbindung werden Server-Updates mit noch nicht bestaetigten lokalen Aenderungen zusammengefuehrt. Bereits gespeicherte Bewertungen gehen dadurch auch dann nicht verloren, wenn ein anderer Spieler waehrend der kurzen Upload-Verzoegerung etwas speichert. Speicherbestaetigungen werden mit ihrer Revision verarbeitet, damit aeltere Rueckmeldungen weder neue lokale Eingaben noch neuere Serverwerte ueberschreiben. Cache-Daten und noch nicht vom Server bestaetigte lokale Firebase-Updates gelten dabei nicht als Serverbestaetigung.

## Lokaler Start

Die App benoetigt fuer den normalen Betrieb keinen Build-Schritt. Sie muss ueber einen lokalen Webserver oder ein Hosting ausgeliefert werden; ein direktes Oeffnen von `index.html` als `file://`-Datei reicht fuer Service Worker und Firebase nicht aus.

Weiterfuehrende Dokumentation:

- [Firebase fuer Web einrichten](https://firebase.google.com/docs/web/setup)
- [Anonyme Anmeldung](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firestore-Echtzeitlistener](https://firebase.google.com/docs/firestore/query-data/listen)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

## Automatische Handbewertung

Unter **Austeilen** einmal pro Tisch eine neue Austeilung mit dem Austeiler anlegen. Auf den anderen Geräten dieselbe Austeilung auswählen, den eigenen Spieler wählen und entweder manuell bewerten oder **Karten auswählen** verwenden. Erst **Bewertung bestätigen und speichern** speichert den Wert. Eine erneute Bestätigung oder ein Wechsel zwischen manueller und automatischer Methode ersetzt die Bewertung dieses Spielers in dieser Austeilung.

Die bisherige App legt keine Blattlänge fest und enthält keine Kartenbilder oder Karten-IDs. Die neue automatische Bewertung gilt ausdrücklich nur für **langes Blatt (8 aus 32 Karten)**; kurzes Blatt wird weiterhin manuell bewertet. Hochzeit und Wenz werden aus den vorhandenen Spielarten vorbelegt und können vor der Bestätigung angepasst werden. Bock und Pflichtramsch ändern diese Bewertung des Handpotenzials vor der Spielansage nicht.

Die reine Funktion `SchafkopfHandEvaluation.evaluateHand(cardIds, rules)` in `src/handEvaluation.js` verwendet feste IDs wie `eichel-ober`, `gras-unter` oder `herz-ass`. Anzeigenamen sind davon getrennt. Ein späterer lokaler Fotoscanner kann dieselben acht IDs übergeben; Kameraerkennung ist nicht implementiert. Die Funktion validiert Hand und Regeln, ist unabhängig von der Kartenreihenfolge und liefert:

- `score`: den höheren Kandidatenwert, auf 1–10 begrenzt und erst danach auf eine Nachkommastelle gerundet;
- `normal`: Grundwert, einzelne Zuschläge, Trumpfanzahl und ungerundete Sauspiel-/Hochzeitbewertung;
- `wenz`: einen separaten Kandidaten ab zwei Unter bei aktivierter Wenzregel, sonst `null`;
- `winningCandidate`, `algorithmVersion` (`hand-v1`) und die verwendeten `rules`.

Alle Gewichte liegen zentral in `WEIGHTS` als Hundertstelpunkte, damit Zuschläge wie 0,25 bis zur Endrundung exakt bleiben. Bei Gleichstand ist die normale Bewertung ausschlaggebend. Diese Heuristik ist keine Gewinnwahrscheinlichkeit und enthält keine eigene Solo- oder Geierbewertung.

### Daten und bisherige Statistik

Die bisherigen numerischen Einträge in `dealRatings[].ratings[spieler]` bleiben erhalten. Zusätzlich enthält `ratingMeta[spieler]` Methode (`manual`/`automatic`), Algorithmusversion und bei automatischer Bewertung die Regeln (`deck`, `hochzeit`, `wenz`). Neue manuelle Bewertungen tragen `manual-v1`; historische Bewertungen werden als `manual`/`legacy` ohne nachträglich erfundene Regeln gekennzeichnet. Unterschiedliche Versionen bleiben beim Laden, Exportieren, Importieren und Umbenennen der Spieler erhalten.

Wie schon bisher ist eine Austeilung unabhängig von den nachträglich erfassten Spielen in `rounds`. Ihre dauerhafte `id` dient gleichzeitig als `roundId` der Austeilung. Es wird keine Zuordnung zu einem Spiel im Spielprotokoll geraten. Der Austeiler steht am Austeilungseintrag, der bewertende Spieler ist der Schlüssel in `ratings` und `ratingMeta`. Beim Anlegen wird zunächst nur eine leere Austeilung synchronisiert; erst die ausdrückliche Bestätigung fügt einen Bewertungswert hinzu. Auf mehreren Geräten dieselbe Austeilung verwenden, statt je Gerät eine neue anzulegen.

Der Austeilerwert bleibt der ungewichtete Durchschnitt **aller Einzelbewertungen der aktuell geführten Mitspieler außer dem Austeiler** – kein Durchschnitt von Rundendurchschnitten und keine neue Gewichtung für automatische Werte. Gesamt- und Spielerwerte zeigen ihre Anzahl an Bewertungen. Leere Austeilungen zählen noch nicht zur Statistik. Methoden, Versionen und gespeicherte Regeln sind an den einzelnen Bewertungen sichtbar.

Die bestehenden Firestore-Räume, anonymen Anmeldungen, Transaktionen und Zugriffsregeln werden weiterverwendet. Gleichzeitige Änderungen verschiedener Spieler derselben Austeilung werden zusammengeführt; bei demselben Spieler gewinnt die zuletzt erfolgreich synchronisierte Änderung mitsamt ihrer Methode und Version. Wiederholte Bestätigungen nutzen dieselbe Austeilungs-ID und denselben Spielerschlüssel. Handkarten bleiben nur im lokalen Eingabezustand und werden weder in Firestore noch in Sicherungen gespeichert. Es werden keine Fotos gespeichert und keine neuen Dienste benötigt. Der Service-Worker-Cache steht nach der Merge-Korrektur auf `schafkopf-v24`.

### Entwicklung und Prüfungen

Für das Hosting ist weiterhin kein Build nötig. Nur die lokalen Tests benötigen Node.js (getestet mit Version 24) und die fest versionierten Entwicklungsabhängigkeiten:

```sh
npm ci --ignore-scripts
npm test
npm run check
```

Bei gesperrtem `npm.ps1` unter Windows kann stattdessen `npm.cmd` verwendet werden. `npm test` prüft Algorithmusfälle, 1.000 deterministisch ausgewählte Hände, historische Daten, Ersetzen, parallele Zusammenführung und den vollständigen React-Bedienablauf einschließlich Bestätigung und erneutem Laden. Die Online-Regressionstests simulieren zusätzlich parallele Geräte, verzögerte und doppelte Rückmeldungen, ausstehende Uploads sowie Raumbeitritt, Raumwechsel und Löschung. Die Firebase-Client-Tests prüfen Snapshot-Filter und Transaktionen mit einem simulierten SDK-Transport und kontrollieren, dass Raumoperationen ausschließlich `schafkopfRooms` ansprechen. `npm run check` übersetzt sämtliche Produktionsskripte mit dem gleichen Babel-React-Preset wie die App, prüft gemeinsame Syntax und globale Deklarationen sowie die PWA-Cache-Dateien.

Hier erfolgreich geprüft: 40 Tests sowie die Skript-/PWA-Prüfung. Die Tests verwenden lokalen Speicher und einen simulierten Firebase-Transport; sie sind kein Live-Test und keine Auswertung der Firestore-Regeln durch den Emulator. Ein Live-Abgleich zwischen Geräten, die Firebase-Zugriffsregeln im Emulator und eine visuelle Smartphone-/Browserprüfung wurden in dieser Umgebung nicht ausgeführt; die Browser-Verbindung meldete keinen verfügbaren Browser. Für die automatische Bewertung sind keine neuen Regelfreigaben nötig. Die lokale `firebase.rules` entspricht nach dem Merge bis auf Leerzeichen und Zeilenumbrüche dem vom Nutzer bereitgestellten gemeinsamen Regelwerk für Smash Bingo und Schafkopf. Bei der Merge-Nachprüfung wurden keine Regeln geändert oder veröffentlicht.
