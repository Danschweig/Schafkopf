    (function(){
      const FIREBASE_VERSION="12.16.0";
      const FIREBASE_BASE=`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const ROOM_COLLECTION="schafkopfRooms";
      const ROOM_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const ROOM_CODE_LENGTH=5;
      const MAX_STATE_BYTES=900000;
      let sdkPromise=null;

      function loadSdk(){
        if(!sdkPromise){
          sdkPromise=Promise.all([
            import(`${FIREBASE_BASE}/firebase-app.js`),
            import(`${FIREBASE_BASE}/firebase-auth.js`),
            import(`${FIREBASE_BASE}/firebase-firestore.js`)
          ]).then(([app,auth,firestore])=>({app,auth,firestore}));
        }
        return sdkPromise;
      }

      function normalizeRoomCode(value){
        return String(value||"").toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,10);
      }

      function validRoomCode(value){
        return /^[A-Z2-9]{5}$|^[A-Z2-9]{10}$/.test(String(value||""));
      }

      function createRoomCode(){
        const bytes=new Uint8Array(ROOM_CODE_LENGTH);
        crypto.getRandomValues(bytes);
        return Array.from(bytes,b=>ROOM_ALPHABET[b%ROOM_ALPHABET.length]).join("");
      }

      function cloneJson(value){
        return JSON.parse(JSON.stringify(value));
      }

      function jsonEqual(a,b){
        return JSON.stringify(a)===JSON.stringify(b);
      }

      function mergeRounds(baseRounds=[],localRounds=[],remoteRounds=[]){
        const base=new Map(baseRounds.map(round=>[String(round.id),round]));
        const local=new Map(localRounds.map(round=>[String(round.id),round]));
        const remote=new Map(remoteRounds.map(round=>[String(round.id),round]));
        const ids=new Set([...base.keys(),...local.keys(),...remote.keys()]);
        const merged=[];

        ids.forEach(id=>{
          const baseRound=base.get(id);
          const localRound=local.get(id);
          const remoteRound=remote.get(id);
          const localChanged=!jsonEqual(localRound,baseRound);
          const remoteChanged=!jsonEqual(remoteRound,baseRound);
          let selected;

          if(!localChanged)selected=remoteRound;
          else if(!remoteChanged)selected=localRound;
          else selected=localRound;

          if(selected)merged.push(cloneJson(selected));
        });

        return merged
          .sort((a,b)=>(Number(a.runde)||0)-(Number(b.runde)||0)||(Number(a.id)||0)-(Number(b.id)||0))
          .map((round,index)=>({...round,runde:index+1}));
      }

      function mergeDealRatings(baseRatings=[],localRatings=[],remoteRatings=[]){
        const base=new Map(baseRatings.map(entry=>[String(entry.id),entry]));
        const local=new Map(localRatings.map(entry=>[String(entry.id),entry]));
        const remote=new Map(remoteRatings.map(entry=>[String(entry.id),entry]));
        const ids=new Set([...base.keys(),...local.keys(),...remote.keys()]);
        const merged=[];

        ids.forEach(id=>{
          const baseEntry=base.get(id);
          const localEntry=local.get(id);
          const remoteEntry=remote.get(id);
          const localChanged=!jsonEqual(localEntry,baseEntry);
          const remoteChanged=!jsonEqual(remoteEntry,baseEntry);
          let selected;

          if(!localChanged)selected=remoteEntry;
          else if(!remoteChanged)selected=localEntry;
          else if(localEntry&&remoteEntry){
            // Merge by player; score and provenance form one indivisible value.
            // Concurrent edits of different players must both survive.
            const ratings={};
            const ratingMeta={};
            const players=new Set([...Object.keys(baseEntry?.ratings||{}),...Object.keys(localEntry.ratings||{}),...Object.keys(remoteEntry.ratings||{})]);
            players.forEach(player=>{
              const pair=entry=>({score:entry?.ratings?.[player],meta:entry?.ratingMeta?.[player]});
              const source=jsonEqual(pair(localEntry),pair(baseEntry))?remoteEntry:localEntry;
              if(source.ratings?.[player]!==undefined){
                ratings[player]=source.ratings[player];
                if(source.ratingMeta?.[player]!==undefined)ratingMeta[player]=source.ratingMeta[player];
              }
            });
            selected={...remoteEntry,...localEntry,ratings,ratingMeta};
          }else selected=localEntry;

          if(selected)merged.push(cloneJson(selected));
        });

        return merged.sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0)||String(a.id).localeCompare(String(b.id)));
      }

      function mergeSessionState(baseState={},localState={},remoteState={}){
        const merged={};
        const keys=new Set([...Object.keys(baseState||{}),...Object.keys(localState||{}),...Object.keys(remoteState||{})]);

        keys.forEach(key=>{
          const baseValue=baseState?.[key];
          const localValue=localState?.[key];
          const remoteValue=remoteState?.[key];
          if(key==="rounds"){
            merged.rounds=mergeRounds(baseValue,localValue,remoteValue);
          }else if(key==="dealRatings"){
            merged.dealRatings=mergeDealRatings(baseValue,localValue,remoteValue);
          }else if(jsonEqual(localValue,baseValue)){
            if(remoteValue!==undefined)merged[key]=cloneJson(remoteValue);
          }else if(localValue!==undefined){
            merged[key]=cloneJson(localValue);
          }
        });

        return merged;
      }

      function validateConfig(config){
        const required=["apiKey","authDomain","projectId","appId"];
        const missing=required.filter(key=>!String(config?.[key]||"").trim());
        if(missing.length)throw new Error(`Firebase-Konfiguration unvollstaendig: ${missing.join(", ")}`);
        return cloneJson(config);
      }

      function validateState(state){
        const clean=cloneJson(state);
        const size=new TextEncoder().encode(JSON.stringify(clean)).length;
        if(size>MAX_STATE_BYTES)throw new Error("Der Online-Spielstand ist zu gross fuer einen Firebase-Raum.");
        return clean;
      }

      async function createClient(rawConfig){
        const config=validateConfig(rawConfig);
        const {app,auth,firestore}=await loadSdk();
        const appName=`schafkopf-${`${config.projectId}-${config.appId}`.replace(/[^a-zA-Z0-9-]/g,"-")}`;
        const firebaseApp=app.getApps().find(existing=>existing.name===appName)||app.initializeApp(config,appName);
        const firebaseAuth=auth.getAuth(firebaseApp);
        const credential=await auth.signInAnonymously(firebaseAuth);
        const db=firestore.getFirestore(firebaseApp);
        let roomRef=null;
        let roomCode="";
        let unsubscribe=null;

        function attachListener(onState,onError){
          if(unsubscribe)unsubscribe();
          unsubscribe=firestore.onSnapshot(roomRef,{includeMetadataChanges:true},snapshot=>{
            // A cached snapshot can contain stale data from this device.
            // Joining and reconnecting always start from the server's state.
            // Local optimistic writes are not server acknowledgements.
            if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
            if(!snapshot.exists()){
              onError?.(Object.assign(new Error("Der Online-Raum wurde geloescht. Der lokale Spielstand bleibt erhalten."),{code:"room-deleted"}));
              return;
            }
            const data=snapshot.data();
            onState?.(cloneJson(data.state||{}),{
              roomCode,
              revision:Number(data.revision)||0,
              updatedBy:data.updatedBy||"",
              hasPendingWrites:snapshot.metadata.hasPendingWrites
            });
          },error=>onError?.(error));
        }

        async function createRoom(initialState,onState,onError){
          const state=validateState(initialState);
          for(let attempt=0;attempt<5;attempt+=1){
            const candidate=createRoomCode();
            const candidateRef=firestore.doc(db,ROOM_COLLECTION,candidate);
            try{
              await firestore.runTransaction(db,async transaction=>{
                const existing=await transaction.get(candidateRef);
                if(existing.exists())throw new Error("room-code-collision");
                transaction.set(candidateRef,{
                  schemaVersion:1,
                  ownerId:credential.user.uid,
                  state,
                  revision:1,
                  createdAt:firestore.serverTimestamp(),
                  updatedAt:firestore.serverTimestamp(),
                  updatedBy:credential.user.uid
                });
              });
              roomCode=candidate;
              roomRef=candidateRef;
              attachListener(onState,onError);
              return roomCode;
            }catch(error){
              if(error?.message!=="room-code-collision")throw error;
            }
          }
          throw new Error("Es konnte kein freier Raumcode erzeugt werden.");
        }

        async function joinRoom(rawRoomCode,onState,onError){
          const candidate=normalizeRoomCode(rawRoomCode);
          if(!validRoomCode(candidate))throw new Error("Der Raumcode muss aus 5 oder 10 Zeichen bestehen.");
          const candidateRef=firestore.doc(db,ROOM_COLLECTION,candidate);
          const snapshot=await firestore.getDocFromServer(candidateRef);
          if(!snapshot.exists())throw new Error("Online-Raum nicht gefunden.");
          roomCode=candidate;
          roomRef=candidateRef;
          attachListener(onState,onError);
          return roomCode;
        }

        async function saveState(localState,baseState,baseRevision){
          if(!roomRef)throw new Error("Kein Online-Raum verbunden.");
          const targetRef=roomRef;
          const local=validateState(localState);
          const base=cloneJson(baseState||{});

          return firestore.runTransaction(db,async transaction=>{
            const snapshot=await transaction.get(targetRef);
            if(roomRef!==targetRef)throw new Error("Die Online-Verbindung wurde beendet.");
            if(!snapshot.exists())throw new Error("Der Online-Raum wurde geloescht.");
            const current=snapshot.data();
            const revision=Number(current.revision)||0;
            const state=revision===Number(baseRevision)
              ?local
              :mergeSessionState(base,local,current.state||{});
            validateState(state);
            transaction.update(targetRef,{
              state,
              revision:revision+1,
              updatedAt:firestore.serverTimestamp(),
              updatedBy:credential.user.uid
            });
            return {state:cloneJson(state),revision:revision+1};
          });
        }

        function watchRooms(onRooms,onError){
          return firestore.onSnapshot(firestore.collection(db,ROOM_COLLECTION),snapshot=>{
            const rooms=snapshot.docs.map(document=>{
              const data=document.data();
              return {
                code:document.id,
                players:Array.isArray(data.state?.players)?data.state.players:[],
                roundCount:Array.isArray(data.state?.rounds)?data.state.rounds.length:0,
                updatedAt:data.updatedAt?.toMillis?.()||data.createdAt?.toMillis?.()||0
              };
            }).sort((a,b)=>b.updatedAt-a.updatedAt||a.code.localeCompare(b.code));
            onRooms(rooms);
          },onError);
        }

        async function deleteRoom(code){
          if(!validRoomCode(code))throw new Error("Ungueltiger Raumcode.");
          await firestore.deleteDoc(firestore.doc(db,ROOM_COLLECTION,code));
        }

        function disconnect(){
          if(unsubscribe)unsubscribe();
          unsubscribe=null;
          roomRef=null;
          roomCode="";
        }

        return {
          uid:credential.user.uid,
          createRoom,
          joinRoom,
          watchRooms,
          deleteRoom,
          saveState,
          disconnect
        };
      }

      window.SchafkopfFirebase={
        version:FIREBASE_VERSION,
        roomCodeLength:ROOM_CODE_LENGTH,
        normalizeRoomCode,
        validRoomCode,
        validateConfig,
        mergeSessionState,
        createClient
      };
    })();
