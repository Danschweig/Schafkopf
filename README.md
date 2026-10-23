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

Unter **Einstellungen > Allgemein > Austeil-Bewertung** schaltet **Legacy
Bewertung** zwischen zwei Eingabewegen um. Standard ist **aus**: Im neuen Modus
legt man eine gemeinsame Austeilung an und bewertet pro Spieler. Nach der
Spielerwahl ist **Karten auswählen** bereits geöffnet; der Fotobutton ist
direkt sichtbar. **Manuell bewerten** bleibt verfügbar.

Mit **Legacy Bewertung an** erscheint der ursprüngliche Ablauf: Austeiler
wählen, alle anderen Spieler mit 1–10 bewerten und gemeinsam speichern. Erst
wenn alle Bewertungen gewählt sind, wird eine vollständige Austeilung
gespeichert. Es gibt dabei keine parallele neue Eingabeansicht. Beide Modi
nutzen dieselben gespeicherten Bewertungen und dieselbe Statistik; ein
Moduswechsel ändert keine bestehenden Werte. Die Einstellung bleibt nach dem
Neuladen auf diesem Gerät erhalten und wird nicht zwischen Online-Geräten
synchronisiert. Der Legacy-Modus unterstützt auch fünf Spieler.

Online wird immer die verdeckte Einzelbewertung verwendet. Die lokale
Legacy-Einstellung bleibt gespeichert und gilt wieder im Offline-Modus.

Unter **Austeilen** einmal pro Spielrunde eine gemeinsame Austeilung mit dem
Austeiler anlegen. Alle Geräte wählen dieselbe Austeilung und den eigenen
Spieler. **Bewertung bestätigen und speichern** lädt den eigenen Wert verdeckt
hoch. Auch der Austeiler kann seine Hand erfassen; seine eigene Hand zählt
weiterhin nicht zu seiner Austeil-Statistik. Vor dem Rundeneintrag kann der
Inhaber des Spielerplatzes seine Bewertung ersetzen. Erst das Speichern von
Spielart und Ergebnis im Spielprotokoll gibt die Werte für alle frei.

### Verdeckte Kartenwerte bis zum Rundenergebnis

1. Vor dem Spielen einmal **Austeilen > Neue Austeilung anlegen** verwenden.
2. Jeder Spieler scannt und bestätigt auf seinem eigenen Handy seine Hand.
   Bestätigte Werte sind zunächst nur auf dem eigenen angemeldeten Gerät
   lesbar. Andere Geräte bekommen weder die Werte noch ihre Bewertungsregeln.
3. Nach dem Spiel wie gewohnt Spielart, Spieler und Ergebnis eintragen.
   Mit diesem Rundeneintrag werden die bestätigten Werte für alle sichtbar
   und zur Austeil-Statistik hinzugefügt. Danach sind sie unveränderlich.
4. Erst dann die nächste Austeilung anlegen. Kartenstrafen, das Öffnen oder
   Abbrechen eines Eingabeformulars und das Bearbeiten einer alten Runde
   geben die aktuelle Austeilung nicht frei.

Bis zur Freigabe berücksichtigen auch Durchschnitte, Zähler, Sicherungen und
Teilen-Links keine verdeckten Werte. Fotos und Karten-IDs verlassen das Gerät
weiterhin nicht. Offline werden bestätigte Werte getrennt vom gemeinsamen
Spielstand lokal aufbewahrt und ebenfalls erst nach dem Rundeneintrag gezählt.
Historische Bewertungen aus älteren Versionen bleiben unverändert sichtbar.

**Für dieses Update müssen die aktuellen Regeln aus
[`firebase.rules`](firebase.rules) in der Firebase-Konsole veröffentlicht werden.**
Ein Push auf GitHub veröffentlicht diese Regeln nicht. Anschließend die neue
App-Version auf allen beteiligten Geräten neu laden. Ohne die neuen Regeln
werden private Uploads abgewiesen; die App veröffentlicht als Ersatz keine
Werte im gemeinsamen Spielstand. Die Smash-Bingo-Regelblöcke sind unverändert.

Die privaten Dokumente liegen unter
`schafkopfRooms/{roomId}/privateDealRatings/{dealId}/players/{playerIndex}`.
Sie enthalten nur den numerischen Wert, bereinigte Bewertungsmetadaten, die
anonyme Geräte-UID und Zeitangaben. Der erste bestätigende Browser besitzt
den Spielerplatz für diese Austeilung. Die bestehende anonyme Anmeldung ist
keine persönliche Anmeldung mit einem Spielernamen; auf einem anderen Gerät
kann man die private Bestätigung dieses Browsers nicht vorzeitig lesen oder
ersetzen. Die Raum-Erstellungszeit verhindert den Zugriff auf alte private
Dokumente nach einer Wiederverwendung desselben Raumcodes.

`completedDeals` im Raum enthält ausschließlich Freigabemarker. Die Regeln
verlangen dazu ein eingetragenes Spielergebnis; der Client schreibt Ergebnis
und Marker in derselben Transaktion. Ein Rückgängigmachen des Ergebnisses
macht bereits freigegebene Bewertungen nicht wieder geheim.

Die automatische Bewertung gilt für **langes Blatt (8 aus 32 Karten)**;
kurzes Blatt wird weiterhin manuell bewertet. Sauspiel, Hochzeit, Wenz,
Farb-Wenz, Geier und Farbsolo werden aus den vorhandenen Spielarten vorbelegt
und können vor der Bestätigung einzeln angepasst werden. Farb-Wenz wird auch
aus einer Wenz-Spielart mit aktivierter Farboption übernommen. Bock verändert
die Kartenbewertung nicht. Für Ramsch muss der entsprechende Schalter in der
Kartenbewertung gewählt werden; das ist unabhängig vom Zufallsschalter für
Pflichtramsch in den Rundeneinstellungen.

Die reine Funktion `SchafkopfHandEvaluation.evaluateHand(cardIds, rules)` in `src/handEvaluation.js` verwendet feste IDs wie `eichel-ober`, `gras-unter` oder `herz-ass`. Anzeigenamen sind davon getrennt. Die lokale Fotoerkennung übergibt dieselben IDs wie die Kartenauswahl. Die Funktion validiert Hand und Regeln, ist unabhängig von der Kartenreihenfolge und liefert:

- `score`: den höchsten aktivierten Kandidatenwert, auf 1–10 begrenzt und erst
  danach auf eine Nachkommastelle gerundet; `null`, wenn keine passende
  Spielart gewählt ist;
- `candidates`: Grundwerte, Zu-/Abschläge, Trumpfanzahl und ungerundete Werte
  pro bewertbarer Spielart;
- `bestCandidate` und `winningCandidate`: ausschlaggebende Spielart und bei
  Farbspielen deren Trumpffarbe; `alternatives` zeigt dort alle vier Farben;
- `algorithmVersion` (`hand-v2`) und die vollständigen gewählten `rules`.

Alle Gewichte liegen zentral in `WEIGHTS` und `VARIANT_WEIGHTS` als
Hundertstelpunkte. Gleichstände werden nach einer festen Kandidatenreihenfolge
aufgelöst. Diese Heuristik ist keine Gewinnwahrscheinlichkeit und keine
Empfehlung für eine regelkonforme Spielansage; Spielposition, fremde Karten,
Spielverhandlung und Stichverlauf werden nicht simuliert.

Die Trumpfzuordnung folgt den beschriebenen
[Schafkopf-Spielarten](https://www.sauspiel.de/schafkopf-lernen/die-spielarten):
Wenz verwendet Unter, Geier Ober, Farb-Wenz Unter plus gewählte Farbe und
Farbsolo Ober/Unter plus gewählte Farbe. Sauspiel und Ramsch verwenden
Ober/Unter plus Herz. Die Zahlenwerte sind eigene, anpassbare Projektgewichte:

| Spielart | Heuristik in `hand-v2` |
| --- | --- |
| Sauspiel | Bisherige Trumpf-Grundwerte, Trumpfqualität, Farb-Asse/Ass-Zehn und freie Farben; ohne Hochzeit-Aufwertung. |
| Hochzeit | Genau ein Sauspiel-Trumpf; bisheriger Grundwert 3,0, ohne Qualität des abzugebenden Trumpfs. |
| Wenz / Geier | Grundwerte nach Anzahl der Unter/Ober: 1,0 / 2,0 / 4,0 / 6,5 / 8,0 bei 0–4; Qualität 0,60 / 0,40 / 0,20 / 0,00 nach Eichel/Gras/Herz/Schellen, Asse +0,60 und Ass-Zehn +0,30. |
| Farb-Wenz / Farbsolo | Alle vier Farben werden geprüft. Trumpf-Grundwerte wie bisher, −1,0 für das Alleinspiel; dazu Trumpfqualität, Farb-Asse/Ass-Zehn und freie Farben. Ober sind beim Farb-Wenz außerhalb der Trumpffarbe gewöhnliche Farbkarten. |
| Ramsch | Ausgangswert 10,0; Abzüge für hohe Trümpfe, hohe Farbkarten, einzelne Farb-Asse/-Zehnen und zusätzliche Stichkontrolle ab fünf Trümpfen. Ein schwaches Blatt ohne hohe Karten ergibt einen hohen Wert. |

**Ramsch ist exklusiv:** Aktivieren schaltet alle anderen Spielarten aus. Wer
danach eine andere Spielart aktiviert, verlässt Ramsch. Ramsch ist beim
normalen Vergleich nicht automatisch aktiv. Hier bedeutet eine hohe Zahl gute
Voraussetzungen zum Vermeiden von Augen und Stichen; ein Durchmarsch wird
entsprechend dem gewählten Ziel nicht belohnt. Die Oberfläche erklärt diese
Richtung und zeigt die negativen Risikoanteile in der Berechnung.

Ohne bewertbaren Kandidaten bleibt die Speicherbestätigung gesperrt. Ein
Modus- oder Regelwechsel speichert keinen neuen Wert. Neue automatische
Bestätigungen tragen `hand-v2` und alle sieben Spielart-Schalter. Historische
Werte und ihre `hand-v1`-Regeln werden unverändert geladen, exportiert und
synchronisiert. `evaluateHandV1()` und seine exakten Regressionstests bleiben
für die bisherige Formel verfügbar.

### Karten fotografieren (Beta)

Unter **Austeilen > Spieler > Karten auswählen > Karten fotografieren** lässt sich auf dem Handy die Kamera öffnen. Der Browser kann stattdessen eine Bildauswahl anbieten; am Computer öffnet sich die Dateiauswahl. Alle acht Karten breit auffächern und möglichst viel von jedem Motiv zeigen. Zahlen, Ober-/Unterzeichen und Farben sollen scharf und gut beleuchtet sichtbar sein. Ein neues Foto ersetzt die aktuelle, noch nicht gespeicherte Kartenauswahl.

Die App führt YOLOv8n mit ONNX Runtime Web lokal in einem eigenen Worker aus.
Unter **Kartenscan (Beta)** verwendet die App ausschließlich das eigene Modell:
`models/bavarian-corners.onnx`, Version `bavarian-corners-pilot-2026-10-22-v3`.
Dieses Modell erkennt die kleinen Eckzeichen der vorhandenen 32 Karten.
Es bekommt das gesamte Foto als Eingabe, keinen vorab ausgeschnittenen
Eckbereich. Die Trainingsziele sind aber Eckzeichen; die echten Trainingsfotos
werden in der Aufbereitung auf deren Bereich zugeschnitten. Für eine gezielte
Nutzung der übrigen sichtbaren Kartenmotive wäre ein erneutes Training mit
markierten sichtbaren Kartenbereichen und teilweise verdeckten Karten nötig.
Eckzeichen und Kartenmotive gemeinsam auszuwerten ist ein sinnvoller nächster
Versuch; die Erkennungsqualität müsste an unabhängigen Handfotos geprüft werden.
Das ursprüngliche allgemeine Modell unter `models/bavarian-cards.onnx`
bleibt als historische Vergleichsdatei erhalten und ist im Scanner nicht
verfügbar. Die Browser-Laufzeit liegt unter
`vendor/onnxruntime/`. Beim ersten Scan werden insgesamt ungefähr 24 MB für
das eigene Modell und die Laufzeit geladen. Die PWA speichert diese statischen Dateien nach Bedarf
im Cache. Der erste Scan braucht eine Internetverbindung.

Es ist weiterhin kein Build, kein Inferenzserver und kein API-Schlüssel für
Bilderkennung nötig. Die verdeckten Online-Bewertungen benötigen die oben
beschriebenen neuen Firebase-Regeln. Beim Push müssen auch
das eigene Modell samt Metadaten in `models/`, die Dateien unter `vendor/`, die
Scanner-Skripte und `scanner-check.html` enthalten sein. `.tools/` und
`node_modules/` sind ausschließlich lokale Entwicklungshilfen und werden
ignoriert.

Vor der Auswertung wird das Foto unter Beachtung seiner Orientierung auf 640 × 640 Pixel mit proportionaler Skalierung und Randflächen verkleinert. Nur diese Pixel gehen an den lokalen Worker. Die App lädt keine Fotos hoch und speichert sie weder in Firebase noch in Sitzungsdaten oder Sicherungen. Die Vorschau bleibt vorübergehend im Arbeitsspeicher und wird beim Wechseln oder Schließen der Eingabe freigegeben. Die Firestore-Regeln ergänzen den Schutz der privaten Zahlenwerte; die Smash-Bingo-Regeln bleiben unverändert.

Das Ergebnis markiert vorgeschlagene Karten im Foto. Auch unsichere Vorschläge
ab dem bisherigen Mindest-Modellwert von 0,35 werden vorausgewählt. Am selben
Ort zählt nur der stärkste Vorschlag; mehrere Eckzeichen derselben Karte ergeben
eine einzelne ID. Bei mehr als acht unterschiedlichen Vorschlägen bleiben die
acht stärksten ausgewählt. Die Prüfliste zeigt die Modellunsicherheit getrennt
von der aktuellen Auswahl und folgt auch manuellen Korrekturen.
Gibt es weniger als acht unterschiedliche, räumlich getrennte Vorschläge,
bleiben Plätze frei. Fehlende oder falsche Karten können im bisherigen Wähler
korrigiert werden. Erst bei acht ausgewählten
Karten erscheint die Bewertung; gespeichert wird weiterhin ausschließlich nach
ausdrücklicher Bestätigung.

**Erkennungsgrenze des allgemeinen Modells:** Das ursprüngliche allgemeine Modell ist eine experimentelle erste Version und fuer eng aufgefaecherte Handkarten derzeit unzuverlaessig. Im privaten Acht-Karten-Beispielfoto liefert das unveraenderte Modell zwei vorausgewaehlte Vorschlaege: Gras-Ass (richtig) und Gras-Zehn (falsch). Sieben der acht tatsaechlichen Karten fehlen. Ein engerer Ausschnitt und Drehungen um +/-15 Grad ergeben ebenfalls keine korrekte vollstaendige Hand. Bei identischen Eingabepixeln liefert das urspruengliche PyTorch-Modell dieselben Klassen wie das ONNX-Modell; die maximale Abweichung der Klassenausgaben liegt bei etwa 0,0000034. Der Export ist damit nicht die Ursache dieses Fehlers. Auch hohe Modellwerte garantieren keine richtige Zuordnung. Fuer die gewuenschte automatische Acht-Karten-Erkennung ist ein besser geeignetes oder gezielt nachtrainiertes Modell noetig; diese Anforderung ist noch nicht erfuellt.

Der Fototest laesst sich lokal wiederholen. Das private Originalfoto bleibt unter `.tools/` und wird nicht veroeffentlicht; die Referenzdatei enthaelt nur die acht von Hand abgelesenen Karten-IDs:

```sh
npm run check:photo -- .tools/handkarten.jpg tests/fixtures/handkarten.expected.json --model models/bavarian-cards.onnx
```

Der Befehl gibt richtige, falsche und fehlende Vorschlaege getrennt aus und endet bei jeder Abweichung mit Exitcode 1. Die Referenzkarten gehen ausschliesslich in den Vergleich und niemals in die Erkennung ein. Die historische Referenzbewertung mit hand-v1 betraegt 4,1/10; hand-v2 ergibt bei allen aktivierten normalen Spielarten 4,4/10. Die Bildverkleinerung im lokalen Test verwendet Sharp; die Smartphone-App verwendet Canvas, deshalb koennen einzelne Modellwerte abweichen. Ein zweites unabhaengiges Bild mit sechs eng gefaecherten Karten wird nur teilweise erkannt. Erfolgreiche technische Tests und Tests mit kontrollierten Erkennungsergebnissen belegen keine zuverlaessige Fotoerkennung.

Quellen, Modellversion, Prüfsummen, Exportcode und Lizenzen sind in [THIRD_PARTY.md](THIRD_PARTY.md) dokumentiert. Der Modell-Checkpoint nennt AGPL-3.0; der Export übernimmt diese Lizenzangabe. ONNX Runtime Web steht unter MIT. Das Modell kann mit `scripts/export-card-model.py` aus dem verlinkten Quell-Checkpoint erneut exportiert werden; Python und die Exportabhängigkeiten sind zum Benutzen der App nicht erforderlich.

### Lokales Nachtrainieren

Die Skripte unter `scripts/` können aus den aufbereiteten Einzelkarten und den
beschrifteten Trainingshänden einen lokalen Datensatz für die Erkennung der
Eckzeichen erzeugen. Der erste Datensatz umfasst 224 synthetische Ansichten
einschließlich leerer Hintergründe und 48 Varianten der drei Trainingshände.
64 weitere synthetische Ansichten dienen zur internen Validierung. Das
zurückgehaltene Hand-Testfoto und seine Ausschnitte werden weder zum Training
noch zur Auswahl der Checkpoints verwendet.

Vorbereitung, festgehaltene Paketversionen, CPU-Training, Feinschliff, Export
und abschließender Fototest sind in [scripts/TRAINING.md](scripts/TRAINING.md)
beschrieben. Datensätze, Fotos und Trainings-Checkpoints bleiben lokal in den
von Git ausgeschlossenen Ordnern. Das Exportskript schreibt einen Kandidaten
unter `.tools/card-training/` und ersetzt das ausgelieferte Modell nicht
automatisch. Ein erfolgreicher Trainingslauf allein belegt noch keine
zuverlässige Erkennung vollständiger Hände.

Der erste lokale Pilot absolvierte 40 Epochen plus zwölf Epochen Feinschliff.
Auf der zurückgehaltenen Acht-Karten-Hand wurden sieben richtige Karten ohne
falsche Übernahme vorausgewählt; Herz-Unter blieb unsicher. Das alte Modell
lieferte auf demselben Foto eine richtige und eine falsche Karte. Auf dem
ersten zusätzlichen Handfoto lieferte der Kandidat fünf richtige Karten ohne
falsche Übernahme. Ein Vergleichsfoto mit einem anderen Kartenmotiv zeigte
zusätzlich eine Verwechslung. Daher bleibt der Kandidat separat unter
`.tools/card-training/candidate-v1/`; das ausgelieferte Modell wurde nicht
ersetzt. Der lokale Bericht liegt unter
`kartenfotos/aufbereitung/trainingsbericht.md`. Diese wenigen Bilder belegen
noch keine zuverlässige vollständige Acht-Karten-Erkennung.

### Zweiter Trainingslauf (historischer Vergleich)

Der neue Datensatz enthält 608 Trainingsansichten: 384 zusammengesetzte
Ansichten einschließlich 24 leerer Hintergründe, 128 Anordnungen einzelner
Eckzeichen und 96 Varianten der drei Trainingshände. Gedrehte Karten,
Verdeckungen, unterschiedliche Größen und Lichtvarianten erweitern die
Aufnahmen. Es wurden keine Testfotos zur Datenerzeugung oder zum Training
verwendet. Die 64 synthetischen Validierungsansichten sind unverändert zum
ersten Lauf. Der zweite Lauf trainierte alle Netzschichten über 16 Epochen;
`best.pt` wurde ausschließlich anhand dieser internen Validierung ausgewählt.

Vergleich mit der echten gebündelten ONNX-WASM-Laufzeit und unveränderten
Auswahlgrenzen der App (Angaben: richtig übernommen / falsch übernommen):

| Bekannter Vergleichsfall | Erster Pilot v1 | Neues Modell v2 |
| --- | ---: | ---: |
| Testhand `Handkarten4.jpg`, 8 Karten | 7 / 0 | 7 / 0 |
| Erstes Beispielfoto, 8 Karten | 5 / 0 | 7 / 0 |
| Anderes Kartenmotiv, 6 Karten | 2 / 1 | 3 / 1 |
| Leere Fläche | 0 / 0 | 0 / 0 |

Bei der Testhand bleibt Herz-Unter unsicher (Modellwert ca. 0,60), beim ersten
Beispielfoto Eichel-König (ca. 0,53). Beide bleiben unter der unveränderten
Übernahmegrenze von 0,65 und werden nicht ergänzt. Auf diesen Originalfotos
entsteht deshalb weiterhin keine vollständige automatische Bewertung.
Zwei der drei Original-Trainingshände werden vollständig richtig erkannt;
bei der dritten fehlt Eichel-Ober. Das ist kein unabhängiger Test.

Acht Belastungsvarianten der zwei bekannten Acht-Karten-Fotos (JPEG-Kompression,
Abdunklung, Drehung um +12/-12 Grad) liefern sechsmal sieben und zweimal acht
richtige Karten, ohne falsche Übernahme. Diese Varianten sind keine neuen
unabhängigen Fotos. Das andere Kartenmotiv zeigt weiterhin Verwechslungen.
Die vollständige Erkennung beliebiger Hände ist damit nicht nachgewiesen.

Die mittlere Inferenzdauer (Median über 19 Auswertungen) lag auf dem Windows-
Rechner mit einem WASM-Thread bei etwa 314 ms, der Modellstart bei etwa
410 ms. Die Bildvorbereitung lief dort mit Sharp. Das sind keine Handyzeiten;
Canvas, Kamera, Downloads und Speichergrenzen können abweichen.

Das geprüfte eigene Modell wird als Beta ausschließlich verwendet. Das allgemeine
Modell bleibt nur für lokale historische Vergleiche erhalten. Private Benchmarkdaten,
Trainingsbilder und der ausführliche Bericht bleiben lokal unter
`.tools/card-training/` bzw. `kartenfotos/aufbereitung/trainingsbericht-v2.md`.
`npm.cmd run check:photo -- <Foto> <Referenz.json>` prüft standardmäßig das in
der App voreingestellte Modell; `--model` erlaubt den expliziten Vergleich.

### Dritter Trainingslauf und aktuelles Ergebnis

Version 3 wurde aus Version 2 über zwölf weitere Epochen auf 1.136 Ansichten
nachtrainiert. Dafür wurden zehn neue echte Trainingsfotos ergänzt; zusammen
mit den bisherigen drei Händen sind jetzt alle 32 Karten in echten
Trainingshänden vertreten. Die zwei neuen Testfotos wurden vor der
Variantenbildung reserviert und weder für Training noch Checkpoint-Auswahl
verwendet. Der Checkpoint wurde anhand der unveränderten internen Validierung
gewählt und vor dem Test exportiert. Die Auswahlgrenzen bleiben unverändert.

| Foto im abschließenden ONNX-WASM-Test | Richtig übernommen | Falsch übernommen |
| --- | ---: | ---: |
| Reserviert: `IMG_7936.jpg` | 8 von 8 | 0 |
| Reserviert: `IMG_7939.jpg` | 8 von 8 | 0 |
| Bekannt: `Handkarten4.jpg` | 8 von 8 | 0 |
| Erstes Beispielfoto | 7 von 8 | 0 |
| Anderes Kartenmotiv, sechs Karten | 4 von 6 | 1 |

Beim ersten Beispielfoto bleibt Eichel-König unsicher. Auf dem anderen
Kartenmotiv bestehen weiterhin Verwechslungen; eine abgedunkelte Variante
enthält zwei falsche Übernahmen. Die zwei reservierten Fotos stammen aus
derselben Aufnahmesitzung wie die neuen Trainingsfotos. Die Ergebnisse belegen
keine allgemeine Zuverlässigkeit auf anderen Geräten oder bei anderem Licht.
Der Median der 19 bekannten Vergleichsauswertungen liegt bei etwa 310 ms auf
dem Windows-Rechner; das ist keine Messung auf einem Handy.

Version 3 ist unter **Kartenscan (Beta)** das einzige verfügbare App-Modell.
Der private Bericht liegt unter `kartenfotos/aufbereitung/trainingsbericht-v3.md`,
die ausführlichen Auswertungen unter `.tools/card-training/candidate-v3/`.

### Auf iPhone und Android prüfen

Die lokale Auswertung verwendet WebAssembly mit einem Thread in einem eigenen
Worker. Die gebündelte ONNX-Laufzeit unterstützt diesen Ausführungsweg auf
Safari/iOS und Chrome/Android; siehe die [Browserübersicht](https://onnxruntime.ai/docs/get-started/with-javascript/web.html).
Die Einstellung mit einem Thread vermeidet zusätzliche Voraussetzungen für
WASM-Multithreading. Das ersetzt keinen Test auf einem konkreten Handy.

Nach Veröffentlichung des vollständigen Arbeitsstands:

1. Die App in Safari auf dem iPhone und in Chrome auf Android neu öffnen.
   Falls noch der vorherige Stand erscheint, die Seite erneut laden.
2. Im Fotodialog **Fotoerkennung auf diesem Handy prüfen** öffnen, alternativ
   `scanner-check.html` im selben GitHub-Pages-Verzeichnis aufrufen.
3. **Gerätetest starten** antippen. Der Test
   verwendet dieselben Produktionsdateien und denselben Worker wie die App.
   Auf einer leeren Fläche dürfen keine Karten übernommen werden. Die
   angezeigten Lade- und Erkennungszeiten gelten nur für diesen Lauf und dieses
   Gerät. Beim ersten Lauf werden ungefähr 24 MB geladen.
4. Anschließend ein echtes Kamerafoto mit acht sichtbaren Eckzeichen aufnehmen
   und jede vorgeschlagene Karte von Hand vergleichen. Der technische Test
   kann die richtigen Karten nicht selbst kennen. Ein vollständiger Vorschlag
   kann trotzdem falsche Karten enthalten.
5. In der App fehlende/falsche Karten korrigieren und erst danach die Bewertung
   bestätigen. Eine unvollständige Auswahl erzeugt keine Bewertung.

Der Fotodialog zeigt **Kartenscan (Beta)** und lädt stets das lokal
nachtrainierte Modell für das vorhandene Kartenblatt. Das Ergebnis nennt die tatsächlich verwendete
Version. Vor dem Laden kontrolliert der Worker Version, Zieltyp und
Klassenreihenfolge der Metadaten; versionierte Modelladressen vermeiden die
Vermischung mit älteren Cache-Einträgen.

Die Geräteprüfung lädt keine Fotos hoch. Die App gibt das große Kamerabild
bereits nach dem Verkleinern frei; Abbruch beendet den Worker. Nominale
48-Megapixel-Fotos mit tatsächlich etwa 48,8 Millionen Pixeln sind zugelassen.
Der Service Worker löscht beim Aktivieren ausschließlich ältere
`schafkopf-v...`-Caches und erhält die Caches anderer Apps.

Eine visuelle Bedienprüfung auf Safari/iPhone oder Chrome/Android wurde hier
nicht ausgeführt, weil die Browser-Verbindung keinen Browser bereitstellte.
Die HTTP-Prüfung mit dem GitHub-Pages-Unterpfad `/Schafkopf/`, lokale
Worker-/React-Tests und ONNX-WASM-Auswertungen prüfen jeweils andere Teile des
Ablaufs. `npm.cmd run check:pages -- https://danschweig.github.io/Schafkopf/`
prüft die aktuell veröffentlichten statischen Dateien ohne Änderungen an der
Seite. Es veröffentlicht den lokalen Arbeitsstand nicht.

### Daten und bisherige Statistik

Die bisherigen numerischen Einträge in `dealRatings[].ratings[spieler]` bleiben erhalten. Zusätzlich enthält `ratingMeta[spieler]` Methode (`manual`/`automatic`), Algorithmusversion und bei automatischer Bewertung die Regeln (`deck` und die sieben Spielart-Schalter; bei historischen Werten weiterhin nur `hochzeit` und `wenz`). Neue manuelle Bewertungen tragen `manual-v1`; historische Bewertungen werden als `manual`/`legacy` ohne nachträglich erfundene Regeln gekennzeichnet. Unterschiedliche Versionen bleiben beim Laden, Exportieren, Importieren und Umbenennen der Spieler erhalten.

Neue Austeilungen sind mit `sealed: true` markiert. Ihre dauerhafte `id` dient
weiterhin als `roundId` der Austeilung. Die nächste neu eingetragene Spielrunde
verweist mit `dealId` auf die offene Austeilung. Der gemeinsame Spielstand
enthält dort leere `ratings` und `ratingMeta`; die Zahlenwerte liegen in
separaten privaten Dokumenten. Erst nach der Freigabe werden diese für alle
geladen. Exporte enthalten nur freigegebene Bewertungen als normale
historische Einträge. Auf mehreren Geräten dieselbe Austeilung verwenden.

Der Austeilerwert bleibt der ungewichtete Durchschnitt **aller Einzelbewertungen der aktuell geführten Mitspieler außer dem Austeiler** – kein Durchschnitt von Rundendurchschnitten und keine neue Gewichtung für automatische Werte. Gesamt- und Spielerwerte zeigen ihre Anzahl an Bewertungen. Leere Austeilungen zählen noch nicht zur Statistik. Methoden, Versionen und gespeicherte Regeln sind an den einzelnen Bewertungen sichtbar.

Die bestehenden Firestore-Räume, anonymen Anmeldungen und Transaktionen werden
weiterverwendet. Private Dokumente haben einen festen Spielerplatz pro
Austeilung; vor der Freigabe kann nur dessen Inhaber den Wert ersetzen.
Verschiedene Spieler laden unabhängig hoch. Historische, bereits öffentliche
Bewertungen verwenden weiterhin die bisherige Zusammenführung. Handkarten
bleiben lokal. Der Service-Worker-Cache steht auf `schafkopf-v30`.

### Entwicklung und Prüfungen

Für das Hosting ist weiterhin kein Build nötig. Nur die lokalen Tests benötigen Node.js (getestet mit Version 24) und die fest versionierten Entwicklungsabhängigkeiten:

```sh
npm ci --ignore-scripts
npm test
npm run check
```

Bei gesperrtem `npm.ps1` unter Windows kann stattdessen `npm.cmd` verwendet werden. `npm test` prüft Algorithmusfälle, 1.000 deterministisch ausgewählte Hände, historische Daten, Ersetzen, parallele Zusammenführung und den vollständigen React-Bedienablauf einschließlich Bestätigung und erneutem Laden. Die Online-Regressionstests simulieren zusätzlich parallele Geräte, verzögerte und doppelte Rückmeldungen, ausstehende Uploads sowie Raumbeitritt, Raumwechsel und Löschung. Die Firebase-Client-Tests prüfen Snapshot-Filter und Transaktionen mit einem simulierten SDK-Transport und kontrollieren, dass Raumoperationen ausschließlich `schafkopfRooms` ansprechen. Die Scanner-Tests prüfen Klassenzuordnung, Bildvorbereitung, Unsicherheit, Duplikate, Korrektur, Bestätigung, Abbruch und Ressourcenfreigabe. Zusätzlich läuft das echte gebündelte ONNX-Modell mit der gebündelten WASM-Laufzeit auf einem leeren Bild und dem unabhängigen Sechs-Karten-Testfoto. `npm run check` übersetzt sämtliche Produktionsskripte mit dem gleichen Babel-React-Preset wie die App, prüft gemeinsame Syntax und globale Deklarationen, die Worker-Syntax sowie die benötigten Scanner- und PWA-Dateien.

Erfolgreich geprüft: 96 App-Tests, die Skript-/PWA-Prüfung und zehn zusätzliche
Tests mit dem echten Firestore-Emulator. Die Emulator-Tests prüfen private
Zugriffe, Abfragen, Freigabe und Schreibsperre, Raumcode-Wiederverwendung und
die unveränderten Smash-Bingo-Bereiche. Ein Test führt den tatsächlichen
Firebase-Client der App mit zwei getrennten Geräte-Identitäten aus: vor dem
Ergebnis nur eigene Werte, danach beide Bewertungen. Ein physischer
Smartphone-Test und eine Prüfung gegen das produktive Firebase-Projekt wurden
nicht ausgeführt. Die neuen Regeln wurden hier nicht veröffentlicht.

Die zusätzlichen Regeltests benötigen Java 21 sowie lokale Testabhängigkeiten
unter `.tools/` (unabhängig von der statischen App):

```powershell
npm.cmd install --prefix .tools/firestore-tests --no-audit --no-fund firebase-tools@15.34.1 @firebase/rules-unit-testing@6.0.0 firebase@13.1.0
npm.cmd run test:rules
```

Das Testskript verwendet ausschließlich das lokale Emulator-Projekt
`demo-schafkopf-private` auf `127.0.0.1:8189` und veröffentlicht nichts.
Java 21 wird aus `.tools/java21/` verwendet, falls dort vorhanden; andernfalls
muss eine passende Java-Version über den Systempfad erreichbar sein.
