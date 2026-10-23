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

Nach 16 zusätzlichen Epochen wurde Version 2 in der App als **Dein
Kartenblatt · neu trainiert (Beta)** verwendet. Das allgemeine Modell
war damals separat auswählbar; inzwischen verwendet die App ausschließlich
das eigene Modell. Auf dem bekannten Testfoto wurden mit Version 2 sieben von
acht Karten ohne falsche Übernahme ausgewählt. Auf dem ersten zusätzlichen
Beispielfoto steigt die Zahl von fünf auf sieben, ebenfalls ohne falsche
Übernahme. Ein anderes Kartenmotiv zeigt weiterhin eine Verwechslung.
Die vollständige automatische Erkennung ist noch nicht zuverlässig belegt.

Der ausführliche private Bericht liegt unter
`aufbereitung/trainingsbericht-v2.md`, die vollständigen Vergleichsauswertungen
unter `.tools/card-training/candidate-v2/benchmark.json`. Fotos, Vorschau,
Datensätze, Checkpoints und diese lokalen Berichte werden nicht mitgepusht.
Die App-Gewichte liegen separat unter `models/bavarian-corners.onnx`.

## Weitere Fotos und dritter Datensatz

Von zwölf neuen Handfotos sind zehn zusätzlich für das Training beschriftet.
`IMG_7936.jpg` und `IMG_7939.jpg` liegen unter `test/` und sind vor jeder
Variantenbildung für den späteren Test reserviert worden. Das ältere Testfoto
bleibt dort. Die neuen Testhände haben andere Kartenkombinationen als die
Trainingshände; sie stammen jedoch aus derselben Aufnahmesitzung.

Für jedes neue Foto gibt es eine `*.labels.json` mit den acht Karten und den
sichtbaren oberen Eckzeichen sowie eine `*.indices.txt`. Unter
`aufbereitung/neue-fotos/` liegen beschriftete Kontrollbilder, eine Übersicht
der ausgeschnittenen Eckzeichen und `split-manifest.json` mit Aufteilung und
Prüfsummen. Bei Querformatbildern bleiben die Koordinaten im Originalbild;
eine zusätzliche Rotationsangabe richtet nur die Trainingsansicht auf.

Der vorbereitete Datensatz `.tools/card-training/pilot-v3/` enthält insgesamt
1.136 Trainingsbilder, davon 480 Varianten der zehn neuen Fotos und 144
Varianten der bisherigen drei Trainingshände. Hinzu kommen 384 synthetische
Szenen und 128 Eckzeichen-Anordnungen. Die 64 synthetischen Validierungsbilder
bleiben gleich. Alle 32 Karten sind nun auch in echten Trainingshänden
vertreten. Testfotos werden für keine dieser Varianten verwendet.

Eine private Vorschau liegt unter `aufbereitung/trainingsbeispiele-v3.jpg`,
die Prüfung unter `aufbereitung/datensatz-v3-pruefung.json`.
Mit diesen Daten wurde Version 3 über zwölf weitere Epochen trainiert und
nach dem Test in die App übernommen. Beide reservierten Testfotos liefern
jeweils acht richtige Karten ohne falsche Übernahme. Das ältere Testfoto
liefert ebenfalls acht richtige Karten; beim ersten Beispielfoto bleiben es
sieben. Ein anderes Kartenmotiv zeigt weiterhin Verwechslungen. Der private
Bericht liegt unter `aufbereitung/trainingsbericht-v3.md`. Die zwei neuen
Testfotos sind nach dieser Prüfung bekannte Vergleichsfälle. Fotos und erzeugte
Varianten bleiben lokal.

## Training auf sichtbare Kartenflächen mit Verdeckungen

`scripts/prepare-card-surface-training.py` erstellt einen separaten Datensatz
unter `.tools/card-training/surfaces-v1/`: 768 Trainingsbilder und 128
Validierungsbilder. Die 32 fotografierten Einzelkarten werden mit verschiedenen
Drehungen, Perspektiven, Lichtverhältnissen und Hintergründen zusammengesetzt.
Es gibt einzelne Karten, aufgefächerte Hände, lose Anordnungen und leere Bilder.
Andere Karten und zusätzliche Abdeckungen verdecken gezielt Kanten, alle vier
Eckzeichen oder den oberen und unteren Kartenrand. Originalfotos bleiben erhalten.

Die Zielrechtecke beschreiben die tatsächlich sichtbaren Kartenflächen statt
einzelner Eckzeichen. Sehr kleine, weitgehend verdeckte Reste erhalten kein
positives Kartenlabel. Die Datei `scenes.json` dokumentiert Sichtbarkeit,
Karten-ID und Art der Abdeckung für jeden Zielbereich. `audit.json` bestätigt
die Prüfung von Quellen, Trennung, Klassenabdeckung und Markierungen.
Eine beschriftete Kontrollübersicht liegt unter `preview.jpg`.

Die Trainingskarten stammen aus `karten2.png`, die Validierung aus `karten1.png`.
Die 13 echten Trainingshände liefern ausschließlich Hintergrundbereiche;
ihre bisherigen Eckzeichen-Markierungen sind keine Kartenflächen-Markierungen.
Testfotos werden nicht gelesen. Diese synthetischen Zusammensetzungen ersetzen
keine unabhängigen echten Handfotos mit verdeckten Ecken. Bei starker Verdeckung
können unterschiedliche Karten dasselbe sichtbare Motiv haben.

Der Hintergrundlauf wird mit der vorhandenen lokalen Python-Umgebung gestartet:

```powershell
.tools/model-export/Scripts/python.exe scripts/run-card-surface-training.py --name surfaces-v1 --epochs 24
```

Er trainiert ausgehend von Version 3 mit allen Netzschichten und exportiert den
anhand der internen Validierung besten Checkpoint anschließend nach
`.tools/card-training/candidate-surfaces-v1/bavarian-surfaces.onnx`.
Der Kandidat ersetzt das App-Modell noch nicht. Vor einer Übernahme müssen die
bekannten Handfotos und Varianten mit verdeckten Eckzeichen verglichen werden.

Fortschritt anzeigen (aus dem Projektordner, beendet die Anzeige mit Strg+C):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\watch-card-training.ps1
```

Die Anzeige liest alle fünf Sekunden die lokal geschriebene `status.json` und
zeigt Epoche, Batch, Prozent und geschätzte Restzeit. Protokolle und Prozess-ID
liegen unter `.tools/card-training/jobs/surfaces-v1/`; dort schreibt ein im
Hintergrund gestarteter Lauf `stdout.log` und `stderr.log`. Der Export erfolgt
automatisch. Die Anzeige endet nach Abschluss oder bei einem Fehler. Das
Schließen der Anzeige beendet den separaten Hintergrundprozess nicht.

### Ergebnis des Kartenflächen-Trainings vom 23.10.2026

Der neu gestartete Lauf `surfaces-v1-20261023` hat 24 Epochen und den ONNX-Export
in rund 59 Minuten abgeschlossen. Nach der internen Validierung wurde der
Checkpoint aus Epoche 22 exportiert. Der Kandidat liegt unter
`.tools/card-training/candidate-surfaces-v1-20261023/bavarian-surfaces.onnx`.

Der Vergleich mit identischen Bildern und unveränderter Auswahlschwelle zeigt:
Auf den drei bekannten echten Testfotos übernimmt das bisherige Modell 24 von
24 Karten richtig, ohne falschen Vorschlag. Der Kandidat übernimmt sechs
richtige und drei falsche Karten. Werden die markierten oberen Eckzeichen
verdeckt, findet der Kandidat sechs richtige und drei falsche Karten, das
bisherige Modell drei richtige ohne falsche. Untere gespiegelte Eckzeichen
können bei diesem Test sichtbar bleiben. Auf der internen synthetischen
Validierung findet der Kandidat mehr Karten, macht aber ebenfalls mehr Fehler.

Der Kandidat ersetzt das App-Modell deshalb nicht. Die Übertragung der
synthetischen Kartenflächen auf echte Handfotos reicht noch nicht aus.
Für einen weiteren Versuch sollten die sichtbaren Kartenflächen in den echten
Trainingshänden markiert werden; diese dienten bisher nur als Hintergrundquelle.
Es wurde kein weiterer Trainingslauf gestartet. Vergleichsskript:
`scripts/compare-card-surface-model.cjs`. Der private Bericht mit allen Zahlen
liegt neben dem Kandidaten unter `comparison.md`, die Einzelvorhersagen unter
`comparison.json`. Die bekannten Testfotos bleiben Vergleichsfälle und ersetzen
keine neue unabhängige Prüfung.

### Echte Kartenflächen und zweiter Kartenflächen-Datensatz

Alle 13 echten Trainingsfotos besitzen nun eine zusätzliche `*.surfaces.json`:
insgesamt 104 explizit eingezeichnete und visuell geprüfte Polygone der
sichtbaren Kartenflächen. Die Karten-IDs stammen aus den bestehenden geprüften
Eckzeichen-Markierungen. Finger und verdeckte Bereiche wurden nach den
Originalfotos ausgespart; es wurden keine Modellvorhersagen als Wahrheit
übernommen. Die Polygone sind grobe Flächenmarkierungen für die daraus
abgeleiteten Detektionsrechtecke, keine pixelgenauen Segmentierungsmasken.
Originalfotos und frühere Markierungen bleiben erhalten.

`scripts/annotate-card-surfaces.py` erstellt Kontrollansichten und überträgt
die eingezeichneten Polygone zurück in Originalkoordinaten. Die lokale
Annotation und farbige Kontrollbilder liegen unter
`.tools/card-training/surface-review-v2/`. Alle 104 Zuordnungen wurden zusätzlich
anhand eines sichtbaren Eckzeichens auf der zugehörigen Fläche geprüft.

`scripts/prepare-real-card-surface-training.py` erstellt `surfaces-v2` mit
864 Trainingsbildern und 116 Validierungsbildern. 480 Trainingsbilder sind
Varianten von zehn echten Handfotos; 384 sind synthetische Szenen. Die
Validierung enthält 36 Varianten von drei vollständig reservierten Fotos und
80 synthetische Kontrollbilder. `Handkarten2`, `IMG_7933` und `IMG_7941` werden
vor jeder Variantenbildung ausschließlich der Validierung zugeordnet. Ihre
Hintergrundbereiche gelangen ebenfalls nicht in die neue Trainingsgruppe.
Alle 32 Karten kommen in beiden Gruppen vor und auch in den zehn echten
Trainingshänden. Die Prüfung steht unter `surfaces-v2/audit.json`.

Die echten Varianten enthalten das ganze Foto und engere Ausschnitte sowie
Drehungen, Lichtänderungen, verdeckte markierte Eckzeichen und zusätzliche
Vordergrund-Abdeckungen. Sichtbarkeit und Zielrechtecke werden nach jeder
Verdeckung neu berechnet. Vollständig verdeckte Karten werden nicht durch
positive Labels erzwungen. Bei den echten Fotos sind nur die markierten
Eckzeichen gezielt abgedeckt; die synthetischen Varianten enthalten zusätzlich
Abdeckungen aller vier Eckzeichen.

Das Nachtraining verwendet den besten Checkpoint des ersten Kartenflächenlaufs,
16 Epochen, alle Netzschichten und Lernrate 0,0003. Startrezept:

```powershell
.tools/model-export/Scripts/python.exe scripts/run-card-surface-training.py --name surfaces-v2-real-20261023 --epochs 16 --data .tools/card-training/surfaces-v2/dataset.yaml --weights .tools/card-training/runs/surfaces-v1-20261023/weights/best.pt --lr 0.0003 --warmup 1 --compare
```

Danach werden der beste Checkpoint exportiert und der Kandidat automatisch mit
dem bisherigen Modell auf den bekannten Testfotos und den ursprünglichen
synthetischen Kontrollbildern verglichen. Ergebnisse und Modell landen unter
`.tools/card-training/candidate-surfaces-v2-real-20261023/`. Das App-Modell wird
dabei nicht ersetzt. Die neue interne Validierung trennt zwar ganze
Quellfotos, der frühere Eckzeichen-Ausgangscheckpoint kannte diese Fotos aber
bereits. Sie ist deshalb keine unabhängige Prüfung. Die drei Testfotos werden
weiterhin erst nach abgeschlossenem Training für den Vergleich gelesen.

Überwachung des Hintergrundlaufs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\watch-card-training.ps1 -Name surfaces-v2-real-20261023
```

Der Lauf ist am 23.10.2026 nach 16 Epochen einschließlich Export und Vergleich
in rund 50 Minuten abgeschlossen worden. Auf den drei bekannten Original-
Testfotos steigt die Trefferzahl gegenüber dem ersten Kartenflächenmodell von
sechs auf elf richtige Vorschläge; zugleich steigt die Zahl falscher Vorschläge
von drei auf sieben. Das bisherige Eckzeichenmodell erkennt dort weiterhin
24 richtige Karten ohne falschen Vorschlag. Mit verdeckten markierten oberen
Eckzeichen findet der neue Kandidat elf richtige und fünf falsche Karten,
das bisherige Modell drei richtige ohne falsche Vorschläge.

Der Kandidat ersetzt das App-Modell deshalb weiterhin nicht. Die höhere
Trefferzahl belegt noch keine verlässliche Verbesserung vollständiger Hände.
Der lokale Bericht `comparison.md` und alle Einzelvorhersagen in
`comparison.json` liegen unter
`.tools/card-training/candidate-surfaces-v2-real-20261023/`. Ein weiterer
Trainingslauf wurde nicht gestartet.
