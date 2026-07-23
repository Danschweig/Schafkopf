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
        return String(value||"").toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,ROOM_CODE_LENGTH);
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

      function mergeSessionState(baseState={},localState={},remoteState={}){
        const merged={};
        const keys=new Set([...Object.keys(baseState||{}),...Object.keys(localState||{}),...Object.keys(remoteState||{})]);

        keys.forEach(key=>{
          const baseValue=baseState?.[key];
          const localValue=localState?.[key];
          const remoteValue=remoteState?.[key];
          if(key==="rounds"){
            merged.rounds=mergeRounds(baseValue,localValue,remoteValue);
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
          unsubscribe=firestore.onSnapshot(roomRef,snapshot=>{
            if(!snapshot.exists()){
              onError?.(new Error("Der Online-Raum wurde geloescht."));
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
          if(candidate.length!==ROOM_CODE_LENGTH)throw new Error(`Der Raumcode muss aus ${ROOM_CODE_LENGTH} Zeichen bestehen.`);
          const candidateRef=firestore.doc(db,ROOM_COLLECTION,candidate);
          const snapshot=await firestore.getDoc(candidateRef);
          if(!snapshot.exists())throw new Error("Online-Raum nicht gefunden.");
          roomCode=candidate;
          roomRef=candidateRef;
          attachListener(onState,onError);
          return roomCode;
        }

        async function saveState(localState,baseState,baseRevision){
          if(!roomRef)throw new Error("Kein Online-Raum verbunden.");
          const local=validateState(localState);
          const base=cloneJson(baseState||{});

          return firestore.runTransaction(db,async transaction=>{
            const snapshot=await transaction.get(roomRef);
            if(!snapshot.exists())throw new Error("Der Online-Raum wurde geloescht.");
            const current=snapshot.data();
            const revision=Number(current.revision)||0;
            const state=revision===Number(baseRevision)
              ?local
              :mergeSessionState(base,local,current.state||{});
            validateState(state);
            transaction.update(roomRef,{
              state,
              revision:revision+1,
              updatedAt:firestore.serverTimestamp(),
              updatedBy:credential.user.uid
            });
            return {state:cloneJson(state),revision:revision+1};
          });
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
          saveState,
          disconnect
        };
      }

      window.SchafkopfFirebase={
        version:FIREBASE_VERSION,
        roomCodeLength:ROOM_CODE_LENGTH,
        normalizeRoomCode,
        validateConfig,
        mergeSessionState,
        createClient
      };
    })();
