# Zahlen-/Buchstaben-Leser für Kartenecken

In der App ist der fertig trainierte Kandidat jetzt unter Kartenscan >
Erkennungsmodell > Zeichenleser optional auswählbar. Standard bleibt das bisherige
Modell; die Wahl des Zeichenlesers wird beim Schließen der Eingabe zurückgesetzt.
Nur ONNX und bereinigte Metadaten wurden aus dem lokalen Kandidaten nach models/
übernommen. Private Exportprüfdaten wurden nicht kopiert. Das weitere Training
ersetzt diese App-Dateien weiterhin nicht automatisch.

## Wiederanlauf nach Windows-Dateisperre

Der erste v2-Lauf endete während Epoche 22, weil Windows den Austausch der
Statusdatei verweigerte. Die Überwachung öffnet Dateien nun mit Freigabe für
Lesen, Schreiben und Löschen. Der Schreiber wiederholt vorübergehend gesperrte
Statusupdates; bleibt die Sperre bestehen, läuft das Training weiter und versucht
es beim nächsten Update erneut. Echte Fehler beim Speichern der Modelldaten
werden weiterhin gemeldet.

Der Wiederanlauf heißt index-reader-v2-recovery. Er übernimmt den besten
erhaltenen Modellstand aus Epoche 17 und lernt bis höchstens Epoche 100 weiter.
Die Gewichte werden übernommen; Optimierer und Lernratenplan beginnen neu.
Das ist kein exakt fortgesetzter alter Prozess. Architektur, Klassen und
Datensatzprüfsumme müssen übereinstimmen. Beispiel für einen neuen Laufnamen:

    .tools/model-export/Scripts/python.exe -u scripts/run-card-index-reader-training.py --name index-reader-v2-recovery --warm-start .tools/card-training/runs/index-reader-v2/best.pt --epochs 100

Der geerbte beste Stand bleibt als Kandidat erhalten. Nach jeder abgeschlossenen
Epoche wird außerdem last.pt mit Modellgewichten, Optimierer, Lernratenplan und
Datensatzprüfsumme gespeichert. best.pt bleibt der nach interner Validierung
ausgewählte Stand. Für einen späteren Wiederanlauf sind die Gewichte auch über
--warm-start nutzbar; dieser Parameter stellt den Optimierer ausdrücklich nicht
wieder her.

Den bereits gestarteten Wiederanlauf nur überwachen, nicht erneut starten:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dansc\Documents\GitHub\SchafkopfNeu\scripts\watch-card-training.ps1" -Name index-reader-v2-recovery

Dieser lokale Trainingsbaustein liest bereits lokalisierte Kartenecken. Er ist
keine allgemeine OCR. Der bisherige YOLO-Detektor findet im Vergleichswerkzeug
die Ecken; seine vorhergesagte Kartenklasse wird verworfen. Nicht gefundene
oder abgeschnittene Zeichen begrenzen weiterhin das gesamte Verfahren.

Das App-Modell wird nicht automatisch ersetzt. Kandidaten, private Bilddaten,
Prüfausschnitte und Trainingsprotokolle bleiben unter dem ignorierten Ordner
.tools/card-training/.

## Variante v2

card_index_reader.py enthält zwei getrennte CNN-Zweige. Der Rangzweig sieht
nur Graustufen und lernt 7, 8, 9, 10, U, O, K, A und unlesbar.
Der RGB-Zweig lernt Eichel, Gras, Herz, Schellen und unlesbar.
Der Rangfehler erhält das 2,5-fache Gewicht. Unlesbare Zeichen ergeben keine
erfundene Karte.

Gegenüber v1 bleiben feine Striche zunächst in voller Auflösung erhalten.
Weitere Faltungen vor dem Verkleinern und ein räumliches Raster von 6 × 6
erhalten mehr Zeichenstruktur. Der Rangzweig normalisiert Helligkeit und Kontrast
innerhalb des exportierten Modells. Für alte Checkpoints bleibt die ursprüngliche
Architektur über CardIndexReader("index-reader-v1") verfügbar.

Eingabe bleibt RGB, NCHW, 0–1, 96 × 96 mit weißen Randflächen und erhaltener
Seitenproportion. Ausgaben: rank_logits (neun Klassen), suit_logits (fünf).
Die Bildaufbereitung des Vergleichswerkzeugs bleibt kompatibel.

## Daten und Grenzen

Die Vorbereitung liest ausschließlich die vorhandenen Referenzaufnahmen und
die geprüften Indexmarkierungen der 13 Trainingshände. Es werden 32 vollständige
obere linke Referenzecken zum Training und 32 aus einer zweiten Aufnahme zur
internen Validierung verwendet. Angeschnittene andere Referenzecken werden
nicht als vollständige Zeichen beschriftet.

Zusätzlich entstehen standardmäßig 2.048 Zeichenbeispiele mit Arial, Times,
Courier und Georgia. Die Hälfte zeigt einzelne Zeichen, die andere Hälfte
kleinere Zeichen neben farbigen Platzhalterformen und Kartenlinien. Diese
Formen werden ausdrücklich nicht als echte Farbsymbole beschriftet; ihre
Farbverluste werden maskiert. Einzelne Zeichen ohne Farbsymbol und leere
Papierflächen lehren die Enthaltung. Schriftdateien werden lokal gelesen,
nicht kopiert oder veröffentlicht.

Die 512 synthetischen Validierungsbeispiele halten die kompletten Schriftfamilien
Verdana und Trebuchet zurück. Insgesamt entstehen 2.253 Trainings- und 568
Validierungsbeispiele. Die gewichtete Stichprobe verwendet echte Handzeichen,
Referenzecken, einzelne Schriftzeichen, Zeichen mit Platzhaltern und leere
Flächen im Verhältnis 30:25:20:20:5.

Alle echten Handaufnahmen bleiben gemeinsam als bekannte Aufnahmesitzung im
Training. kartenfotos/test/ wird weder zur Vorbereitung noch zur Auswahl des
Checkpoints gelesen. Die Referenzvalidierung zeigt dasselbe physische Deck.
Diese bereits wiederholt verwendeten Diagnosebeispiele sind **kein unabhängiger
Spielabend- oder Decktest**. Sie beweisen keine zuverlässige Erkennung anderer
Hersteller oder Aufnahmesituationen. Dafür brauchen wir später neue Decks und
vollständig zurückgehaltene Spielabende.

## Vorbereiten und prüfen

Die vorhandene Python-Umgebung reicht aus. Es werden keine Modellgewichte
heruntergeladen.

    .tools/model-export/Scripts/python.exe scripts/prepare-card-index-reader.py
    .tools/model-export/Scripts/python.exe scripts/prepare-card-index-reader.py --audit
    .tools/model-export/Scripts/python.exe -m unittest discover -s tests -p test_card_index_reader.py
    node --test tests/cardIndexReader.test.cjs

Standardausgabe ist .tools/card-training/index-reader-v2. Bestehende Datensätze
werden nicht überschrieben; bei erneuter Vorbereitung --output ändern.
Die Font-Liste liegt standardmäßig unter C:/Windows/Fonts, alternativ --fonts
angeben. Quellen, Markierungen, Bildprüfsummen, Gruppen und Klassen werden
geprüft. Änderungen an Quellen oder Generator erfordern eine neue Vorbereitung.
Vorschaubilder erlauben eine Sichtkontrolle.

## Training im Hintergrund

Standard: bis zu 100 Epochen mit 1.536 Ziehungen je Epoche. In den ersten zwölf
Epochen werden Bildveränderungen schrittweise verstärkt; 20 % der Ziehungen
bleiben unverändert. Rotation, Lichtänderungen, leichte Unschärfe und kleinere
Auflösung bleiben Teil des Trainings. Es gibt keine Spiegelung.

Der beste Checkpoint wird anhand interner Validierung gewählt: 50 % Ranggenauigkeit
auf zurückgehaltenen Schriftfamilien, 30 % gemeinsame Rang-/Farbgenauigkeit der
Referenzen, 20 % über Farbklassen gemittelte Genauigkeit. Nach mindestens 40
Epochen und 20 Epochen ohne Verbesserung kann der Lauf vorzeitig enden. Außerdem
werden Verwechslungsmatrix, Rang- und Farbgenauigkeit der Referenzen und
Messwerte je Bildart gespeichert. Hohe Enthaltungsgenauigkeit auf Leerbildern
soll dadurch Fehler bei echten Farbsymbolen nicht verdecken.

Aus dem Projektordner starten (Start-Process als eine Zeile eingeben):

    $readerJob = Join-Path (Get-Location) '.tools\card-training\jobs\index-reader-v2'
    New-Item -ItemType Directory -Path $readerJob -Force | Out-Null
    Start-Process -FilePath (Resolve-Path '.tools\model-export\Scripts\python.exe').Path -ArgumentList '-u scripts/run-card-index-reader-training.py --name index-reader-v2' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput (Join-Path $readerJob 'stdout.log') -RedirectStandardError (Join-Path $readerJob 'stderr.log')

Nur einmal starten. Weitere Läufe benötigen einen neuen Namen. Ein doppelter
Start wird abgelehnt, ohne die Statusdatei des ursprünglichen Laufs zu ändern.
Ein kurzer technischer Probelauf ist beispielsweise mit --epochs 12
--min-epochs 12 --samples-per-epoch 768 --name index-reader-v2-pilot möglich.

Überwachen aus einem beliebigen PowerShell-Verzeichnis:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dansc\Documents\GitHub\SchafkopfNeu\scripts\watch-card-training.ps1" -Name index-reader-v2

Phase, Epoche, Fortschritt und ungefähre Restdauer stehen unter
.tools/card-training/jobs/index-reader-v2/. stderr.log enthält Fehler.
Der Prozess exportiert abschließend automatisch ONNX und prüft echte
ONNX-WASM-Ausgaben gegen PyTorch, einschließlich der Ausgabewerte bei
dynamischer Stapelverarbeitung. Erst danach meldet er complete. Das ist ein
technischer Abschluss, keine automatische Freigabe der Erkennungsqualität.

## Diagnosen und späterer Fotovergleich

Fertige Checkpoints auf derselben internen Validierung vergleichen:

    .tools/model-export/Scripts/python.exe scripts/evaluate-card-index-reader.py .tools/card-training/runs/index-reader-v1/best.pt .tools/card-training/runs/index-reader-v2/best.pt --report .tools/card-training/index-reader-v2/comparison.json

Der begrenzte v2-Probelauf mit zwölf Epochen erkannte auf den 32 Referenzecken
14 Karten vollständig und 19 Rangzeichen richtig. V1 erkannte auf denselben
Ecken sieben Karten vollständig und neun Rangzeichen. Die Farbgenauigkeit sank
dabei von 27/32 auf 25/32. Das ist ein Hinweis auf besseres Ranglernen, aber noch
kein brauchbarer Scanner. Der interne Vergleich bleibt zur Prüfung gespeichert.

Erst nach abgeschlossener Auswahl des Checkpoints einen bekannten Fototest
durchführen; seine Ergebnisse anschließend nicht zur Auswahl weiterer Varianten
verwenden:

    node scripts/check-card-index-reader.cjs --reader .tools/card-training/candidate-index-reader-v2/card-index-reader.onnx kartenfotos/test/IMG_7936.jpg kartenfotos/test/IMG_7936.labels.json .tools/card-training/candidate-index-reader-v2/comparison-7936.json

Die Referenzkarten gehen ausschließlich in die Auswertung ein. Unsichere
Vorschläge bleiben erkennbar; weniger als acht korrekte Karten ergeben keinen
erfolgreichen Fototest. Vor einer App-Integration sind außerdem Geschwindigkeit
und Speicherbedarf auf echten Handys zu prüfen.
