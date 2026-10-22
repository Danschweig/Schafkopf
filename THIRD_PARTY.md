# Bestandteile der lokalen Fotoerkennung

## Schafkopf-Erkennungsmodell

`models/bavarian-cards.onnx` wurde aus `schafkopf_yolo.pt` von Niklas Kaup
(`Nikiki95/schafkopf-engine`) exportiert:

https://github.com/Nikiki95/schafkopf-engine/blob/d4e4efc04973416b1aa98e2d13cd268c8fcf0f6d/schafkopf_yolo.pt

Der **Modell-Checkpoint selbst nennt AGPL-3.0**. Diese Angabe wird für das
abgeleitete ONNX-Modell beibehalten; die allgemeine MIT-Angabe in der
Upstream-README wird dafür nicht verwendet. Der Lizenztext liegt in
`models/LICENSE-AGPL-3.0.txt`. Training und Modellstruktur verwenden
[Ultralytics YOLO](https://github.com/ultralytics/ultralytics/tree/v8.4.21).

Die entsprechende Modellquelle, Klassenzuordnung, Quell- und Export-Prüfsummen
sowie die verwendeten Exportversionen stehen in
`models/bavarian-cards.metadata.json`. Der verwendete Exportcode liegt unter
derselben AGPL-3.0-Lizenz in `scripts/export-card-model.py`. Die ursprünglichen
Trainingsskripte liegen im verlinkten Upstream-Repository. Dessen vollständige
Trainingsdaten und die ursprünglichen Kamerascans sind dort nicht enthalten;
ein erneutes vollständiges Training ist damit nicht reproduzierbar. Das
konvertierte Modell kann aus dem veröffentlichten Checkpoint erneut exportiert
werden. Das urspr?ngliche allgemeine Modell wurde nicht anhand von Nutzerfotos
verändert. Der zusätzliche lokale Trainingskandidat unter
`.tools/card-training/candidate-v1/` verwendet die aufbereiteten Nutzerbilder
ausschließlich lokal. Diese Fotos wurden nicht hochgeladen. Der Kandidat ist
kein Bestandteil des aktuell gebündelten Modells.

Das Modell hat 32 Klassen (bayerisches Doppelbild). Seine Vorhersagewerte sind
keine kalibrierten Wahrscheinlichkeiten. Eine zuverlässige Erkennung beliebiger
Handyfotos oder sämtlicher Druckvarianten wurde nicht nachgewiesen.

## Nachtrainiertes Eckzeichenmodell

`models/bavarian-corners.onnx` ist zusätzlich enthalten und für das vorhandene
Kartenblatt das einzige im Scanner verwendete Modell. Es leitet sich vom selben AGPL-3.0-Checkpoint ab
und übernimmt diese Lizenz. Das allgemeine Modell bleibt unverändert separat
enthalten. Version, Klassen, Prüfsummen und Trainingsherkunft des zusätzlichen
Modells stehen in `models/bavarian-corners.metadata.json`.

Für das lokale Nachtraining wurden die vom Nutzer bereitgestellten
Einzelkartenbilder und beschriftete Trainingshände verwendet. Nach der zweiten
Erweiterung mit 608 Ansichten wurden zehn weitere echte Trainingsfotos
ergänzt. Version 3 umfasst 1.136 Trainingsansichten aus 13 echten Händen und
zwölf zusätzliche Epochen. Zwei neue Handfotos wurden vor der Variantenbildung
für den abschließenden Test reserviert. Die
Fotos und daraus erzeugten Trainingsbilder bleiben von Git ausgeschlossen;
das Browser-Modell enthält die trainierten Gewichte. Es gibt keinen Dienst
zum Hochladen oder Auswerten von Nutzerfotos.

Datenerzeugung, beschränkter Checkpoint-Import, Training und Export stehen in
`scripts/prepare-card-training.py`, `scripts/card_model_checkpoint.py`,
`scripts/train-card-model.py` und `scripts/export-trained-card-model.py`.
Die ausführbare Rezeptur und die Einschränkungen der bekannten Vergleichsfotos
stehen in `scripts/TRAINING.md`. Auch diese abgeleiteten Trainings-/Exportteile
werden unter AGPL-3.0 geführt. Das Modell wurde nicht auf dem privaten
Testfoto oder dessen Ausschnitten trainiert. Seine Erkennung bleibt
experimentell; ein anderes Kartenmotiv zeigt weiterhin Verwechslungen.

## ONNX Runtime Web 1.20.1

Die drei Dateien unter `vendor/onnxruntime/` stammen unverändert aus
`onnxruntime-web@1.20.1` von Microsoft, MIT-Lizenz. Der vollständige Lizenztext
liegt daneben in `vendor/onnxruntime/LICENSE`.

Quelle: https://github.com/microsoft/onnxruntime/tree/v1.20.1

Die Laufzeit und das ONNX-Modell werden von derselben GitHub-Pages-Seite geladen.
Sie führen die Bildauswertung auf dem Gerät aus. Es ist kein Cloud-Inferenzdienst
eingebunden.

## Testfoto

`tests/fixtures/bavarian-fan-six.jpg` ist die 1280-Pixel-Vorschau von
„Deutsche Spielkarten mit bayerischem Bild.jpg“, L3u, 23. März 2021, CC0 1.0:

https://commons.wikimedia.org/wiki/File:Deutsche_Spielkarten_mit_bayerischem_Bild.jpg

Das Bild zeigt vier Ober und zwei Unter, also **sechs** Karten. Es ist ein
unabhängiges Testbild, kein Foto einer vollständigen Acht-Karten-Hand. Das Modell
erkennt darauf aktuell nur einen Teil der Karten. Der Test prüft ausdrücklich,
dass daraus keine vollständige Hand erfunden oder bewertet wird. Dieser Test
belegt keine zuverlässige Erkennung einer aufgefächerten Acht-Karten-Hand.
