# Schafkopf Tracker

Offline-faehige PWA zum Erfassen und Auswerten eines Schafkopf-Spielabends. Optional kann ein Spielstand ueber Cloud Firestore in Echtzeit zwischen mehreren Geraeten synchronisiert werden.

## Online-Modus mit Firebase einrichten

Der Online-Modus ist standardmaessig deaktiviert. Ohne Firebase-Konfiguration arbeitet die App wie bisher ausschliesslich lokal.

1. In der [Firebase-Konsole](https://console.firebase.google.com/) ein Projekt und darin eine Web-App anlegen.
2. Cloud Firestore fuer das Projekt aktivieren.
3. Unter **Authentication > Sign-in method** die anonyme Anmeldung aktivieren.
4. Den Inhalt von [`firebase.rules`](firebase.rules) als Firestore-Regeln veroeffentlichen.
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

## Lokaler Start

Die App benoetigt fuer den normalen Betrieb keinen Build-Schritt. Sie muss ueber einen lokalen Webserver oder ein Hosting ausgeliefert werden; ein direktes Oeffnen von `index.html` als `file://`-Datei reicht fuer Service Worker und Firebase nicht aus.

Weiterfuehrende Dokumentation:

- [Firebase fuer Web einrichten](https://firebase.google.com/docs/web/setup)
- [Anonyme Anmeldung](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firestore-Echtzeitlistener](https://firebase.google.com/docs/firestore/query-data/listen)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
