# Lokales Training der Karteneckzeichen

Die Python-Skripte sind Entwicklungshilfen. Die statische App braucht weiterhin
weder Python noch einen Build. Sie laden keine Nutzerfotos hoch.

## Daten

`prepare-card-training.py` verwendet die visuell geprüften Einzelkartenbilder
und ausschließlich die Handfotos unter `kartenfotos/training/` samt
`*.labels.json`. Das Verzeichnis `kartenfotos/test/` wird nicht eingelesen.

Für den ersten Lauf werden die 32 Ausschnitte aus `Karten2.jpg` zum Training
verwendet. Die 32 Ausschnitte aus `Karten1.jpg` liefern andere synthetische
Anordnungen zur internen Validierung. Beide zeigen dasselbe Kartenblatt;
diese Validierung ersetzt keinen unabhängigen Test echter Handfotos.

Der Datensatz enthält 224 synthetische Ansichten (darunter leere Hintergründe)
und 48 abgewandelte Ansichten aus drei Trainingshänden. Die synthetische
Validierung umfasst 64 Ansichten. Zielobjekte sind die kleinen Eckzeichen
(Zahl/Buchstabe plus Farbsymbol), keine vollständigen Karten. Synthetische
Ansichten markieren alle sichtbaren Eckzeichen. Die echten Trainingshände
werden auf das beschriftete Band begrenzt, damit unbeschriftete gespiegelte
Zeichen am unteren Kartenende nicht fälschlich als Hintergrund gelten.

Der Generator erstellt `provenance.json` mit Quellen und Prüfsummen. Er
verweigert ein bereits vorhandenes Ausgabeverzeichnis. Vor dem ersten Lauf
müssen die Bilder und ihre Annotationen wie in `kartenfotos/README.md`
vorbereitet sein. Die Foto- und Datensatzordner sind von Git ausgeschlossen.

## Umgebung und Befehle

Verwendet: Python 3.13 und die Versionen in
`scripts/card-training-requirements.txt`. Im vorhandenen Projekt liegt die
lokale Umgebung unter `.tools/model-export/`.

Aus dem Projektverzeichnis in PowerShell:

```powershell
& .tools/model-export/Scripts/python.exe scripts/prepare-card-training.py
& .tools/model-export/Scripts/python.exe scripts/train-card-model.py --epochs 40 --freeze 10
& .tools/model-export/Scripts/python.exe scripts/export-trained-card-model.py .tools/card-training/runs/pilot-v1/weights/best.pt
```

Der Trainingslauf übernimmt die Gewichte des bereits geprüften
`schafkopf_yolo.pt`, trainiert zunächst die späteren Netzschichten auf der CPU
und wählt den Checkpoint anhand der internen Validierung aus. Der Seed ist
festgehalten. Die Originalgewichte werden beim Einlesen mit dem eingeschränkten
PyTorch-Unpickler und explizit erlaubten Modellklassen geöffnet.

Alle Checkpoints und der exportierte Kandidat bleiben unter
`.tools/card-training/`. `export-trained-card-model.py` erlaubt Ausgaben nur
unter `.tools/`; es überschreibt das ausgelieferte Modell nicht. Pfade und
Trainingsargumente werden aus den eingebetteten ONNX-Metadaten entfernt.

Ein anschließender Feinschliff kann auch die frühen Netzschichten anpassen.
Dabei weiterhin nur die interne Validierung verwenden:

```powershell
& .tools/model-export/Scripts/python.exe scripts/train-card-model.py --weights .tools/card-training/runs/pilot-v1/weights/best.pt --name pilot-v1-finetune --epochs 12 --freeze 0 --lr 0.0003 --nbs 16 --warmup 1 --warmup-bias-lr 0.003
```

Die beiden Läufe anhand derselben internen Validierung vergleichen und erst
danach den gewählten Checkpoint am Testfoto auswerten. Das Beispiel zum Export
oben verweist auf den ersten Lauf; bei Auswahl des Feinschliffs entsprechend
`runs/pilot-v1-finetune/weights/best.pt` einsetzen.

## Erweiterter zweiter Datensatz

Der zweite Lauf erzeugt 608 Trainingsansichten: 384 zusammengesetzte Ansichten
(einschließlich 24 leerer Hintergründe), 128 Anordnungen isolierter Eckzeichen
und 96 Varianten der drei echten Trainingshände. Er verwendet stärkere
Drehungen, Verdeckungen und Hintergrundflächen aus den drei Trainingsfotos.
Die Kartensymbole stammen unverändert aus den fotografierten Einzelkarten;
sie werden geometrisch und farblich verändert, nicht neu gezeichnet.
Verdeckte Eckzeichen werden aus den Markierungen entfernt.

Die 64 Validierungsansichten bleiben pixel- und markierungsgleich zum ersten
Lauf. Der zweite Datensatz enthält 6.420 Trainingsobjekte und mindestens 154
Objekte pro Klasse. Seine Erzeugung liest keine Testfotos. Die zwei bereits
ausgewerteten Handfotos bleiben für diesen Lauf bekannte Vergleichsfälle;
sie liefern keinen neuen unabhängigen Qualitätsnachweis.

```powershell
& .tools/model-export/Scripts/python.exe scripts/prepare-card-training.py --output .tools/card-training/pilot-v2 --synthetic 384 --patch-scenes 128 --real-variants 32 --seed 20261023 --photo-backgrounds
& .tools/model-export/Scripts/python.exe scripts/train-card-model.py --data .tools/card-training/pilot-v2/dataset.yaml --weights .tools/card-training/runs/pilot-v1-finetune/weights/best.pt --name pilot-v2 --epochs 16 --freeze 0 --lr 0.0002 --nbs 16 --warmup 1 --warmup-bias-lr 0.002
& .tools/model-export/Scripts/python.exe scripts/export-trained-card-model.py .tools/card-training/runs/pilot-v2/weights/best.pt --output .tools/card-training/candidate-v2/bavarian-cards.onnx --version bavarian-corners-pilot-2026-10-22-v2
```

Auch dieser Lauf wählt `best.pt` ausschließlich anhand der internen
Validierung. Er passt keine Auswahlschwellen an Testbilder an. Ein privates
Vorschaubild liegt unter `kartenfotos/aufbereitung/trainingsbeispiele-v2.jpg`.

## Abschließende Prüfung

Erst nach der Auswahl des Checkpoints das zurückgehaltene Testfoto prüfen:

```powershell
npm.cmd run check:photo -- kartenfotos/test/Handkarten4.jpg kartenfotos/test/Handkarten4.labels.json --model .tools/card-training/candidate-v1/bavarian-cards.onnx --report .tools/card-training/candidate-v1/test-report.json
```

Die Auswertung verwendet die gebündelte ONNX-WASM-Laufzeit und dieselben
Schwellen wie die App. Die Referenzkarten gehen nur in den Vergleich ein.
Mehrere erkannte Ecken derselben Karte ergeben beim Eckzeichenmodell eine
einzelne Karten-ID. Unsichere Klassen werden nicht übernommen. Exitcode 1
bedeutet, dass nicht genau die acht richtigen Karten vorgeschlagen wurden;
ein Trainingslauf mit guten internen Metriken kann trotzdem daran scheitern.

Das neue Modell wird erst nach Prüfung in die App übernommen. Ein einzelnes
Testfoto erlaubt keine belastbare Aussage zur Zuverlässigkeit auf anderen
Handys, Hintergründen oder Lichtverhältnissen. Nach einer Auswertung ist dieses
Foto ein bekannter Benchmark; für weitere unabhängige Prüfungen werden neue
Aufnahmen benötigt.

Modell und davon abgeleitete Trainings-/Exportskripte übernehmen die
AGPL-3.0-Lizenz des Quell-Checkpoints; siehe `THIRD_PARTY.md`.

Für den bekannten Vergleich einschließlich dunklerer, gedrehter und stärker
komprimierter Varianten gibt es zusätzlich:

```powershell
node scripts/benchmark-card-model.cjs .tools/card-training/candidate-v2/bavarian-cards.onnx .tools/card-training/candidate-v2/benchmark.json
```

Das Skript führt die echte gebündelte ONNX-WASM-Laufzeit aus. Es trennt echte
Trainingsfotos, bekannte Vergleichsfotos und deren Belastungsvarianten.
Varianten sind keine neuen unabhängigen Testfotos. Der Bericht enthält
Desktopzeiten aus Node; er misst weder Canvas auf dem Handy noch dessen
Prozessor oder Speichergrenzen. Erst nach Abschluss des CPU-Trainings messen,
damit die zusätzliche Last die Zeiten nicht verzerrt.

Die statischen Dateien lassen sich über `npm.cmd run check:pages -- <URL/>`
prüfen. Der Befehl liest die veröffentlichte Seite, lokale Skripte, PWA-Dateien,
WASM und Modelle über HTTP und prüft Modellprüfsummen. Er veröffentlicht
nichts und ersetzt keinen Browsertest. Nach dem Push dient `scanner-check.html`
zur Prüfung auf dem tatsächlichen Handy: identischer Scanner-Service und
Worker, technische Ausführung auf leerem Bild, anschließend optional eigenes
Kartenfoto mit manuellem Vergleich. Fotos bleiben lokal.
