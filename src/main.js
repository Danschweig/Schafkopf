    ReactDOM.createRoot(document.getElementById("root")).render(
      sharedData ? <ViewerApp data={sharedData}/> : <SchafkopfTracker/>
    );
