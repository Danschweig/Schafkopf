# Privates Trainingsarchiv auf Windows 11

Das Archiv läuft mit Node.js direkt auf dem Heimserver. Tailscale Serve stellt
HTTPS bereit, ausschließlich für die eingeladenen Geräte. Es werden keine
Router-Ports geöffnet. Docker und eine gekaufte Domain sind nicht erforderlich.
Die Schafkopf-App bleibt an ihrer bisherigen Adresse erreichbar.

## Einmalige Einrichtung auf dem Heimserver

1. [Node.js LTS](https://nodejs.org/en/download) (mindestens Version 22) und
   [Tailscale für Windows](https://tailscale.com/download/windows) installieren.
   Alternativ in PowerShell:

   ```powershell
   winget install --id OpenJS.NodeJS.LTS --exact
   winget install --id Tailscale.Tailscale --exact
   ```

2. Tailscale starten, mit einem persönlichen Konto anmelden und die anderen
   Spieler ins eigene Netz einladen. Auf jedem beitragenden Handy Tailscale
   installieren, anmelden und verbinden. Ein eigenes Benutzerkonto pro Person
   verwenden. Der Personal-Tarif erlaubt derzeit sechs Nutzer kostenlos:
   [Tarife](https://tailscale.com/pricing).

3. Diesen Projektordner auf den Heimserver kopieren oder dort auschecken.
   In einem neuen PowerShell-Fenster in den Projektordner wechseln. Dann:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\training-archive\Setup-TrainingArchive.ps1 `
     -AppOrigin 'https://danschweig.github.io' `
     -ArchiveDirectory 'C:\SchafkopfTraining' `
     -BackupDirectory 'D:\SchafkopfTraining-Sicherungen' `
     -Autostart
   ```

   `AppOrigin` ist der Ursprung der tatsächlichen App-Adresse, ohne Projektpfad.
   Für `https://name.github.io/SchafkopfNeu/` also `https://name.github.io`.
   Der App-Ursprung ist für die bisherige GitHub-Pages-Adresse voreingestellt.
   Verzeichnis- und Laufwerksbeispiele passend ersetzen. Eine echte zweite Festplatte für die Sicherung
   wählen. Ohne zweite Festplatte `-BackupDirectory` zunächst weglassen; dann
   besteht noch **keine unabhängige Datensicherung**. Keine gemappten Netzlaufwerke
   für geplante Aufgaben verwenden; bei Netzspeicher einen erreichbaren UNC-Pfad
   und die passenden Windows-Anmelderechte verwenden.

   Das Skript erzeugt einen zufälligen Zugangsschlüssel und schränkt den
   Archivordner auf dein Windows-Konto und SYSTEM ein. Es startet den Dienst
   verborgen. `-Autostart` richtet den Start **bei deiner Windows-Anmeldung** ein;
   vor der Anmeldung läuft dieser Task nicht. Der Server muss eingeschaltet und
   angemeldet bleiben. Ohne `-Autostart` wird nur der aktuelle Prozess gestartet.
   Wiederholtes Einrichten behält den Schlüssel. Einen laufenden Dienst vor einer
   erneuten Einrichtung über die Aufgabenplanung beenden.

4. Den privaten HTTPS-Zugang aktivieren:

   Bei vorhandenem Tailscale (etwa für Jellyfin) zuerst die bestehende
   Konfiguration prüfen. Der folgende eigene HTTPS-Port 8443 muss noch frei sein;
   falls er bereits verwendet wird, zuerst einen anderen freien Port wählen.

   ```powershell
   tailscale serve status
   tailscale funnel status
   ```

   Wenn 8443 noch frei ist:

   ```powershell
   tailscale serve --bg --https=8443 http://127.0.0.1:8787
   tailscale serve status
   ```

   Beim ersten Mal gegebenenfalls den angezeigten Link zur Freischaltung von
   HTTPS öffnen. Die ausgegebene `https://…ts.net:8443`-Adresse einschließlich Port aufbewahren.
   `serve --bg` bleibt nach einem Tailscale-Neustart bestehen.
   [Tailscale-Serve-Anleitung](https://tailscale.com/docs/reference/tailscale-cli/serve).
   Für dieses Archiv ausschließlich den Port weiterleiten; keinen Dateiordner
   veröffentlichen. Tailscale Funnel ist für diese private Einrichtung nicht nötig.
   Bei Bedarf in der Tailscale-Netzrichtlinie den Mitspielern nur HTTPS auf diesem
   Server erlauben, besonders wenn weitere Dienste im Netz laufen.

5. In der App **Einstellungen → Allgemein → Trainingsbilder** öffnen:
   HTTPS-Adresse eintragen, den Schlüssel aus
   `C:\SchafkopfTraining\Handy-Zugang.txt` übernehmen und
   **Trainingsbilder beitragen** einschalten. Auf jedem Handy separat einrichten.
   Schlüssel nicht ins Repository oder in öffentliche Chats kopieren. Er erlaubt
   Uploads, aber keinen Zugriff auf archivierte Fotos.

## Betrieb und Sicherung

```powershell
Get-Content 'C:\SchafkopfTraining\archive.log' -Tail 30 -Wait
Get-ScheduledTask -TaskName 'Schafkopf Trainingsarchiv*'
```

Konfiguration: `C:\SchafkopfTraining\config.json`. Standardlimit: 20 GiB.
Nach Änderung des Limits, Schlüssels oder der erlaubten App-Ursprünge den Dienst
neu starten. Ein Schlüsselwechsel muss anschließend auf den Handys nachgetragen
werden. Das HTTP-Backend bindet ausschließlich an `127.0.0.1`; nur Tailscale
terminiert HTTPS. Es gibt keine Foto-Downloads und keine öffentliche Dateiliste.
Lokale Administratoren können wie bei anderen Dateien auf das Archiv zugreifen.
Die Einrichtung konfiguriert Dateirechte; sie aktiviert keine Festplattenverschlüsselung.

Die App puffert höchstens 100 Fotos / 80 MiB in IndexedDB. Browserdaten-Löschen
oder Speicherbereinigung kann ausstehende Bilder entfernen. Uploads werden beim
Öffnen, bei Netzrückkehr und ungefähr jede Minute in der geöffneten App versucht.
Mobilbrowser müssen im Hintergrund keine Uploads ausführen. Bei ausgeschalteter
Bildspende pausieren Uploads; vorhandene Bilder können separat gelöscht werden.
Ein Zielwechsel überträgt alte Bilder niemals stillschweigend an den neuen Server.

Mit `-BackupDirectory` richtet das Setup eine tägliche Sicherung um 04:00 Uhr ein,
die bei verpasstem Termin nachgeholt wird. Jeder Tag bekommt einen eigenen Ordner;
gelöschte Originale werden nicht aus alten Sicherungen entfernt. Nach der Kopie
werden die SHA-256-Prüfsummen der Bilder überprüft. Zugangsschlüssel und laufende
temporäre Uploads werden nicht gesichert. Aufbewahrungsdauer und freien Platz auf
der Sicherungsplatte selbst verwalten; alte Sicherungen werden nie automatisch
gelöscht. Erste Sicherung und Wiederherstellung vor längerem Betrieb ausprobieren:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\training-archive\Backup-TrainingArchive.ps1 `
  -ArchiveDirectory 'C:\SchafkopfTraining' `
  -BackupDirectory 'D:\SchafkopfTraining-Sicherungen'
```

Zur Wiederherstellung bei gestopptem Archivdienst den `samples`-Ordner einer
geprüften Sicherung in ein neu eingerichtetes Archiv kopieren, private Dateirechte
erneut prüfen und `node .\server\training-archive\dataset.cjs verify <Archiv>`
ausführen. Die neue Installation erzeugt ihren eigenen Zugangsschlüssel.

## Inhalt und spätere Datensätze

```
samples/abend-2026-10-23/<Bild-UUID>/
  image.jpg
  metadata.json
  regions.json       # später ergänzte, visuell geprüfte Kartenflächen
```

Gespeichert werden eine JPEG-Kopie bis 2.000 Pixel ohne Erkennungsrahmen,
Aufnahme-/Bestätigungszeit, Modellversion, ursprüngliche Vorschläge und
Erkennungsregionen, die acht bestätigten Karten sowie die Spielabend-ID.
Erkennungsregionen sind ausdrücklich **keine geprüften Trainingsannotationen**.
Sie beziehen sich auf das 640er Modellbild; dessen Letterbox-Transformation und
die Original-/Archivabmessungen stehen in den Metadaten. Die Bildkopie enthält
keine EXIF-/GPS-Daten; Hände und Hintergrund können weiterhin sichtbar sein.
Es werden keine Spielernamen, Raumcodes, Zugangsschlüssel oder Spielstände archiviert.

Die automatische Spielabend-ID verwendet das Berliner Datum mit Tageswechsel
um 06:00 Uhr. Für besondere Abende kann auf allen Geräten dieselbe eigene ID
eingetragen werden. Solche manuellen IDs nach dem Abend wieder entfernen oder
beim nächsten Abend ändern. Wiederholte Bestätigung derselben Auswahl bleibt
dieselbe Spende. Eine spätere andere Auswahl erzeugt eine getrennte Revision mit
derselben `sourceCaptureId`, damit Korrekturen nachvollziehbar bleiben.

Für jedes zum Training vorgesehene Bild zunächst die **sichtbaren Kartenflächen**
am archivierten Bild markieren. `regions.json` hat folgendes Format; alle acht
Objekte mit mindestens drei Polygonpunkten in Archiv-Bildkoordinaten ergänzen:

```json
{
  "visuallyReviewed": true,
  "imageSha256": "Prüfsumme aus metadata.json",
  "objects": [
    {"cardId": "eichel-ass", "polygon": [[100, 100], [200, 100], [200, 400], [100, 400]]}
  ]
}
```

Nur tatsächlich geprüfte Dateien auf `visuallyReviewed: true` setzen.
Der Export lässt ungeprüfte Bilder aus und prüft Prüfsummen und Polygonkoordinaten:

```powershell
node .\server\training-archive\dataset.cjs verify 'C:\SchafkopfTraining'
node .\server\training-archive\dataset.cjs export 'C:\SchafkopfTraining' 'C:\Schafkopf-Datensatz-01'
```

Der Export schreibt JPEGs, YOLO-Bounding-Box-Labels aus den sichtbaren Polygonen,
`classes.json` und ein Herkunftsmanifest. Spielabende werden deterministisch zu
80 % Training / 20 % Test zugeordnet; bei wenigen Abenden kann ein Teil leer sein.
Dann verweigert der Export die Ausgabe. Optional eine `splits.json` als letztes
Argument angeben: `{"abend-2026-10-23":"train","abend-2026-10-30":"test"}`.
Niemals einzelne Bilder eines Abends aufteilen. Identische Bilder oder Aufnahmen
über beide Teile hinweg werden abgewiesen. Für Modellwahl zusätzlich ganze
Abende aus dem Training als Validierung zurückhalten; Testabende bleiben bis zur
abschließenden Auswertung unberührt. Vorhandene 13 Trainingsfotos sind dadurch
nicht nachträglich unabhängige Testdaten. Kein Training wird automatisch gestartet.
