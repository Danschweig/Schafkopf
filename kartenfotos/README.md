# Fotos für die Kartenerkennung

Hier die Originalfotos sammeln. Die Bilddateien werden von Git ignoriert und
beim normalen Push nicht veröffentlicht. Nur diese Anleitung und die leere
Ordnerstruktur mit `.gitkeep`-Dateien werden versioniert.

## Einzelkarten

Unter `einzelkarten/` gibt es für jede Farbe einen Ordner:
`eichel`, `gras`, `herz`, `schellen`.

Jeder enthält acht Kartenordner:
`sieben`, `acht`, `neun`, `zehn`, `unter`, `ober`, `koenig`, `ass`.

Beispiele:

- Eichel-Ober → `einzelkarten/eichel/ober/`
- Gras-Ass → `einzelkarten/gras/ass/`
- Herz-Neun → `einzelkarten/herz/neun/`
- Schellen-König → `einzelkarten/schellen/koenig/`

In jeden Kartenordner mindestens ein scharfes Foto der richtigen Karte legen.
Die ganze Vorderseite samt allen vier Ecken soll sichtbar sein. Möglichst
gerade von oben, ohne Spiegelungen und ohne andere Karten fotografieren.
Mehrere Aufnahmen pro Karte sind willkommen. Dateinamen sind frei wählbar;
bei mehreren Fotos unterschiedliche Namen verwenden. JPEG oder PNG bevorzugen.
Die leeren `.gitkeep`-Dateien können liegen bleiben.

## Trainingsfotos

Unter `training/` Fotos echter Hände mit jeweils acht aufgefächerten Karten
sammeln, so wie sie später in der App fotografiert werden. Alle acht oberen
Kartenzeichen sollen sichtbar sein. Unterschiedliche Hände, Hintergründe,
Lichtverhältnisse und Neigungen verwenden, möglichst scharf und in
Originalauflösung. Die Zuordnung der sichtbaren Karten und ihre Markierungen
werden später für das Training ergänzt.

## Testfotos

Unter `test/` zusätzliche, unabhängig aufgenommene Handfotos sammeln. Diese
werden ausschließlich zur abschließenden Prüfung verwendet, nicht zum
Training. Dieselben Fotos oder nahezu identische Serienaufnahmen nicht auf
beide Ordner verteilen. Ein bearbeitetes oder zugeschnittenes Trainingsfoto
ist kein unabhängiges Testfoto.

Die Ordner sammeln zunächst nur Bildmaterial. Dadurch wird noch kein Modell
trainiert und die Erkennungsqualität der App ändert sich noch nicht.

## Bereits aufbereitete Fotos

Die Übersichten `einzelkarten/Karten1.jpg` und `einzelkarten/Karten2.jpg`
bleiben als Originale erhalten. Daraus wurden **64 Einzelbilder** ausgeschnitten,
aufgerichtet und visuell geprüft: In jedem der 32 Kartenordner liegen
`karten1.png` und `karten2.png`. Die Fotos wurden nicht nachgezeichnet oder
retuschiert. Die PNG-Dateien enthalten die ausgeschnittenen Fotomotive mit
einem kleinen Sicherheitsrand. Die zugehörigen JSON-Dateien dokumentieren
Karten-ID, Originaldatei, Zuschnittkoordinaten und Prüfsumme.

Zu den drei Trainingsfotos und dem Testfoto liegt jeweils eine
`Handkarten*.labels.json` mit den acht von Hand bestimmten Karten-IDs.
Zusätzlich sind darin die sichtbaren Eckzeichen (Zahl/Buchstabe und kleines
Farbsymbol) als Rechtecke in Originalpixeln markiert. `Handkarten*.indices.txt`
enthält diese Markierungen im normalisierten YOLO-Format. Diese Rechtecke
beschreiben **nur die Eckzeichen**, keine vollständigen Kartenumrisse.
Die Reihenfolge der Klassen steht in `aufbereitung/classes.json`.

Unter `aufbereitung/` liegen:

- `zuordnung.md`: lesbare Liste aller vier Hände;
- `karten1-einzelkarten.jpg` und `karten2-einzelkarten.jpg`: beschriftete
  Kontrollübersichten der jeweils 32 fertigen Einzelbilder;
- `handkarten-eckzeichen.jpg`: alle 32 beschrifteten Eckzeichen der Handfotos;
- `handkarten*-markierungen.jpg`: Markierungen auf den Handfotos;
- `manifest.json`: vollständige Herkunft, Karten-IDs, Koordinaten und
  Prüfsummen der Originale und Zuschnitte.

Trainings- und Testbilder bleiben getrennt. Die drei Trainingshände enthalten
24 verschiedene Karten, die Testhand die übrigen acht. Alle 32 Karten sind
zusätzlich in beiden Einzelkartenübersichten enthalten. Drei Trainingshände
und ein Testfoto sind ein Anfang; sie erlauben noch keine belastbare Aussage
zur Erkennung bei anderem Licht, anderen Hintergründen oder anderen Geräten.
Die Aufbereitung selbst verändert das App-Modell nicht.

## Erster Trainingslauf

Ein lokaler Pilot wurde inzwischen trainiert: 40 Epochen mit zunächst
eingefrorenen frühen Netzschichten und zwölf Epochen Feinschliff. Dafür wurden
224 künstliche Ansichten und 48 Varianten der drei Trainingshände erstellt.
Das Testfoto blieb aus Training und Checkpoint-Auswahl ausgeschlossen.

Auf dem zurückgehaltenen Testfoto übernimmt der Kandidat sieben richtige
Karten und keine falsche; Herz-Unter bleibt unsicher. Das erste zusätzliche
Handfoto liefert fünf richtige Karten ohne falsche Übernahme. Ein anderes
Kartenmotiv zeigt aber eine Verwechslung. Der Kandidat ersetzt deshalb das
App-Modell noch nicht.

Einzelheiten stehen in [aufbereitung/trainingsbericht.md](aufbereitung/trainingsbericht.md).
Die generierten Trainingsbilder liegen unter
`.tools/card-training/pilot-v1/images/train/`, die Gewichte unter
`.tools/card-training/runs/pilot-v1-finetune/weights/best.pt` und der
Browser-Kandidat unter `.tools/card-training/candidate-v1/bavarian-cards.onnx`
(jeweils relativ zum Projektverzeichnis). Alle bleiben lokal.

## Zweiter Trainingslauf

Der neue Datensatz unter `.tools/card-training/pilot-v2/` enthält 608 Ansichten:
384 zusammengesetzte Szenen, 128 Eckzeichen-Anordnungen und 96 Varianten der
drei Trainingshände. Die 64 Validierungsbilder sind unverändert zum ersten
Lauf. Die Vorschau liegt lokal unter
`aufbereitung/trainingsbeispiele-v2.jpg`. Originalfotos bleiben unverändert;
Testfotos und ihre Ausschnitte wurden nicht zum Training verwendet.

Nach 16 zusätzlichen Epochen wird das neue Modell in der App als **Dein
Kartenblatt · neu trainiert (Beta)** verwendet; das allgemeine Modell bleibt
separat auswählbar. Auf dem bekannten Testfoto werden weiterhin sieben von
acht Karten ohne falsche Übernahme ausgewählt. Auf dem ersten zusätzlichen
Beispielfoto steigt die Zahl von fünf auf sieben, ebenfalls ohne falsche
Übernahme. Ein anderes Kartenmotiv zeigt weiterhin eine Verwechslung.
Die vollständige automatische Erkennung ist noch nicht zuverlässig belegt.

Der ausführliche private Bericht liegt unter
`aufbereitung/trainingsbericht-v2.md`, die vollständigen Vergleichsauswertungen
unter `.tools/card-training/candidate-v2/benchmark.json`. Fotos, Vorschau,
Datensätze, Checkpoints und diese lokalen Berichte werden nicht mitgepusht.
Die App-Gewichte liegen separat unter `models/bavarian-corners.onnx`.
