    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js')
          .then(function(reg) { console.log('SW registriert:', reg.scope); })
          .catch(function(err) { console.log('SW Fehler:', err); });
      });
    }
  </script>
</body>
