
/* Blue Shift: two-player pursuit. Host owns physics and round outcomes.
 * Transport: PeerJS 1.5.5 / WebRTC data channels. No audio/video permissions.
 * Optional deployment configuration: window.BLUESHIFT_PEER_OPTIONS, set before this script.
 */
(() => {
  'use strict';
  const VERSION = 2, PREFIX = 'blueshift-pvp-v1-', KEYS = ['forward','brake','left','right','nitro','handbrake'];
  const STOP = {forward:false,brake:false,left:false,right:false,nitro:false,handbrake:true};
  const NUMBERS = ['x','z','vx','vz','yaw','yawRate','steering','nitro','boostCooldown','refillDelay','distance','forwardSpeed','slip','acceleration','impact','mass','power','topSpeed','grip','punctured'];
  const ROLES = ['racer','cop'];
  const SUPPORT = {backup:{key:'V',name:'BACKUP',cooldown:20},roadblock:{key:'M',name:'ROADBLOCK',cooldown:30},special:{key:'N',name:'SPIKE BLOCK',cooldown:90}};
  const idleClock = () => ({phase:'lobby',countdown:3,elapsed:0,capture:0,escape:0,winner:'',reason:''});
  const opposite = role => role === 'cop' ? 'racer' : 'cop';
  const cleanInput = value => Object.fromEntries(KEYS.map(key => [key,value?.[key] === true]));
  const validVehicle = state => state && NUMBERS.every(key => Number.isFinite(state[key]) && Math.abs(state[key]) < 1e7) &&
    Math.abs(state.x) < 100000 && Math.abs(state.z) < 100000 && Math.abs(state.vx) < 1000 && Math.abs(state.vz) < 1000 &&
    typeof state.boost === 'boolean' && typeof state.boostLock === 'boolean';
  const validStates = states => states && ROLES.every(role => validVehicle(states[role]));
  const bounded = (value,min,max) => Number.isFinite(value) && value >= min && value <= max;
  const validSupport = support => support && support.cooldowns && Object.entries(SUPPORT).every(([kind,spec]) => bounded(support.cooldowns[kind],0,spec.cooldown)) &&
    Array.isArray(support.units) && support.units.length <= 14 && new Set(support.units.map(unit=>unit?.id)).size === support.units.length &&
    support.units.every(unit => unit && Number.isInteger(unit.id) && unit.id >= 0 && unit.id < 14 && unit.role === (unit.id < 2 ? 'pursuit' : 'roadblock') &&
      bounded(unit.health,0,100) && typeof unit.wrecked === 'boolean' && bounded(unit.wreckAge,0,60) && validVehicle(unit.state)) &&
    Array.isArray(support.blocks) && support.blocks.length <= 3 && new Set(support.blocks.map(block=>block?.slot)).size === support.blocks.length &&
    support.blocks.every(block => block && Number.isInteger(block.slot) && block.slot >= 0 && block.slot < 3 && block.targetId === 501 &&
      bounded(block.x,-1000,1000) && bounded(block.z,-1000,1000) && bounded(block.yaw,-Math.PI,Math.PI) && bounded(block.age,0,60) &&
      bounded(block.dx,-1,1) && bounded(block.dz,-1,1) && Math.abs(Math.hypot(block.dx,block.dz)-1) < .01 &&
      [-1,1].includes(block.gapSide) && typeof block.special === 'boolean' && Array.isArray(block.barriers) && block.barriers.length === 2 &&
      block.barriers.every(barrier => barrier && bounded(barrier.x,-1000,1000) && bounded(barrier.z,-1000,1000) && bounded(barrier.w,.1,50) && bounded(barrier.d,.1,50)));
  const validClock = clock => clock && ['lobby','countdown','playing','paused','finished'].includes(clock.phase) &&
    ['elapsed','countdown','capture','escape'].every(key => Number.isFinite(clock[key]) && clock[key] >= 0 && clock[key] < 1000) &&
    ['',...ROLES].includes(clock.winner) && typeof clock.reason === 'string' && clock.reason.length < 180;
  function randomCode(length = 8) {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)), n => alphabet[n % alphabet.length]).join('');
  }
  const mp = window.BlueShiftMultiplayer = {
    active:false, host:false, connected:false, busy:false, guestReady:false, role:'racer', hostRole:'racer',
    code:'', map:'city', round:0, clock:idleClock(), adapter:null, peer:null, conn:null,
    remoteInput:{...STOP}, remoteInputAt:0, lastHeard:0, lastSend:0, inputAt:0, inputSignature:'', lastUI:0,
    generation:0, timer:0, heartbeat:0, ping:0, lastSnapshot:-1, serial:0, message:'', isError:false,
    supportNotice:'', supportNoticeUntil:0, pendingSupport:null,
    attach(adapter) { this.adapter = adapter; this.buildUI(); return this; },
    setStatus(text, error = false) { this.message = text; this.isError = error; this.refresh(); },
    show() { if (!this.dialog.open) this.dialog.showModal(); this.refresh(); },
    open() {
      if (!this.adapter) return;
      if (this.active && ['playing','countdown'].includes(this.clock.phase)) this.pause();
      else if (!this.active) this.adapter.pauseSolo();
      this.show();
    },
    buildUI() {
      const dialog = this.dialog = document.createElement('dialog');
      dialog.id = 'bs-mp-dialog'; dialog.setAttribute('aria-labelledby','bs-mp-title');
      dialog.innerHTML = `
        <div class="bs-mp-top"><div><span class="bs-mp-eyebrow">BLUE SHIFT · ONLINE 1v1</span><h2 id="bs-mp-title">Bring a friend.<br>Pick a side.</h2></div><button id="bs-mp-close" aria-label="Close multiplayer menu">×</button></div>
        <p>One cop. One racer. The same streets.</p>
        <div id="bs-mp-setup">
          <label for="bs-mp-role">YOUR SIDE AS HOST</label><select id="bs-mp-role"><option value="racer">Racer — make your escape</option><option value="cop">Cop — stop your friend</option></select>
          <label for="bs-mp-map">MAP</label><select id="bs-mp-map"></select>
          <div class="bs-mp-row"><button id="bs-mp-host" class="bs-mp-primary">CREATE ROOM</button></div>
          <div class="bs-mp-divider">OR JOIN YOUR FRIEND</div>
          <label for="bs-mp-code-input">ROOM CODE</label><div class="bs-mp-row"><input id="bs-mp-code-input" placeholder="8-letter code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false"><button id="bs-mp-join">JOIN</button></div>
        </div>
        <div id="bs-mp-room" hidden>
          <label>ROOM CODE</label><output id="bs-mp-code" class="bs-mp-code"></output>
          <div class="bs-mp-row"><button id="bs-mp-copy-code">COPY CODE</button><button id="bs-mp-copy-link">COPY INVITE LINK</button></div>
          <p id="bs-mp-roster"></p>
          <div class="bs-mp-row"><button id="bs-mp-start" class="bs-mp-primary">START CHASE</button><button id="bs-mp-swap">SWAP SIDES</button></div>
          <div class="bs-mp-row"><button id="bs-mp-resume" class="bs-mp-primary">RESUME CHASE</button><button id="bs-mp-leave">LEAVE ROOM</button></div>
        </div>
        <div id="bs-mp-status" role="status" aria-live="polite">Create a room, then share its code with your friend.</div>
        <div class="bs-mp-rules"><b>COP</b> — Stay within 9 m of the racer while they are below 29 km/h for 3 seconds.<br><b>RACER</b> — Keep more than 140 m ahead for 8 seconds, or survive 3 minutes.<br>WASD / arrows to drive · Shift for nitro · Space to handbrake.<br><b>COP SUPPORT</b> — V: backup · M: roadblock · N: spike block. You can also tap the on-screen buttons. Spikes can puncture friendly tires.</div>
        <p class="bs-mp-note">Both players need this version and an internet connection. Keep the host's tab open. Switching away pauses the chase. Rooms use PeerJS Cloud to connect; restrictive networks may require a TURN relay.</p>`;
      document.body.append(dialog);
      const hud = this.hud = document.createElement('section');
      hud.id = 'bs-mp-hud'; hud.hidden = true; hud.setAttribute('aria-label','Multiplayer chase');
      hud.innerHTML = `<div class="bs-mp-hud-top"><strong id="bs-mp-side"></strong><button id="bs-mp-menu">ROOM / PAUSE</button></div><div id="bs-mp-hud-title"></div><div id="bs-mp-hud-detail"></div><div id="bs-mp-meter"><i></i></div>
        <div id="bs-mp-support" hidden aria-label="Police support">${Object.entries(SUPPORT).map(([kind,spec])=>`<button id="bs-mp-support-${kind}" aria-keyshortcuts="${spec.key}" title="${spec.name} (${spec.key})"><span><kbd>${spec.key}</kbd> ${spec.name}</span><small>READY</small></button>`).join('')}</div>
        <div id="bs-mp-support-notice" hidden role="status" aria-live="polite"></div>`;
      document.body.append(hud);
      this.el = id => document.getElementById('bs-mp-' + id);
      this.adapter.maps().forEach(map => { const o = document.createElement('option'); o.value=map.id; o.textContent=map.name; this.el('map').append(o); });
      this.el('map').value = this.adapter.info().map;
      this.el('role').value = this.adapter.info().role;
      this.el('host').onclick = () => this.create();
      this.el('join').onclick = () => this.join();
      this.el('start').onclick = () => this.startRound();
      this.el('resume').onclick = () => this.resume();
      this.el('swap').onclick = () => this.swap();
      this.el('leave').onclick = () => this.leave('You left the room.');
      this.el('menu').onclick = () => this.open();
      for(const kind of Object.keys(SUPPORT))this.el('support-'+kind).onclick = event => {event.currentTarget.blur();this.support(kind);};
      this.el('close').onclick = () => this.closeMenu();
      this.el('copy-code').onclick = () => this.copy(this.code);
      this.el('copy-link').onclick = () => {
        if (!/^https?:$/.test(location.protocol)) { this.copy(this.code); return; }
        const url = new URL(location.href); url.hash = 'room=' + this.code; this.copy(url.href);
      };
      dialog.addEventListener('cancel', e => { e.preventDefault(); this.closeMenu(); });
      dialog.addEventListener('keydown', e => { if(e.code === 'Enter' && e.target === this.el('code-input')) {e.preventDefault();this.join();} });
      // Stop the original game's shortcuts while entering a room code or navigating this dialog.
      window.addEventListener('keydown', e => {if(dialog.open) {this.adapter.clearKeys(); if(e.code==='Escape'){e.preventDefault();this.closeMenu();} else if(e.code==='Enter'&&e.target===this.el('code-input')){e.preventDefault();this.join();} e.stopImmediatePropagation();}}, true);
      const code = new URLSearchParams(location.hash.slice(1)).get('room');
      if (code && /^[A-Z2-9]{8}$/i.test(code)) { this.el('code-input').value=code.toUpperCase(); this.show(); }
      window.addEventListener('pagehide', () => this.shutdown());
      this.refresh();
    },
    closeMenu() { if(this.active && this.clock.phase==='paused') this.resume(); else this.dialog.close(); },
    async copy(value) {
      try { await navigator.clipboard.writeText(value); this.setStatus('Copied. Send it to your friend.'); }
      catch { this.setStatus('Select and copy this: ' + value); }
    },
    canConnect() {
      if(this.busy || this.active) return false;
      if(!this.adapter.info().ready) { this.setStatus('The game is still loading. Try again when it is ready.'); return false; }
      if(!window.RTCPeerConnection || !window.Peer) {this.setStatus('This browser does not support multiplayer. Try current Chrome, Edge, or Firefox.',true);return false;}
      return true;
    },
    async create() {
      if(!this.canConnect())return;
      this.host=true; this.hostRole=this.el('role').value; this.role=this.hostRole; this.map=this.el('map').value; this.code=randomCode();
      this.connectPeer(true);
    },
    async join() {
      if(!this.canConnect())return;
      const code=this.el('code-input').value.trim().replace(/[\s-]/g,'').toUpperCase();
      if(!/^[A-Z2-9]{8}$/.test(code)){this.setStatus('Enter the 8-character room code from your friend.',true);return;}
      this.host=false; this.code=code; this.connectPeer(false);
    },
    connectPeer(host) {
      const generation=++this.generation;
      this.busy=true; this.setStatus(host?'Opening your room…':'Connecting to your friend…');
      const options={secure:true,debug:0,...(window.BLUESHIFT_PEER_OPTIONS || {})};
      let peer;
      try { peer = this.peer = new Peer(host?PREFIX+this.code:'blueshift-guest-'+randomCode(18),options); }
      catch {this.leave('Could not start multiplayer. Check your browser and connection.',true);return;}
      this.timer=setTimeout(()=>{if(this.generation===generation)this.leave('Connection timed out. Check the code, keep the host’s tab open, and try another network if needed.',true);},25000);
      peer.on('open',()=>{
        if(this.generation!==generation)return;
        if(host) {
          clearTimeout(this.timer); this.busy=false; this.activate(); this.setStatus('Room open. Share your code and wait for your friend.');
        } else this.bind(peer.connect(PREFIX+this.code,{serialization:'json',reliable:true,metadata:{game:'blue-shift',version:VERSION}}),generation);
      });
      peer.on('connection',conn=>{
        if(this.generation!==generation || !host || this.conn) {
          conn.on('open',()=>{try{conn.send({t:'reject',reason:'This room already has two players.'});}catch{}setTimeout(()=>conn.close(),200);});return;
        }
        this.bind(conn,generation);
      });
      peer.on('error',error=>{
        if(this.generation!==generation)return;
        if(this.connected && ['network','disconnected','socket-error','socket-closed'].includes(error.type))return;
        const messages={'peer-unavailable':'Room not found. Check the code and ask the host to keep their room open.','unavailable-id':'That room code is busy. Create another room.','browser-incompatible':'Your browser cannot use WebRTC. Try Chrome, Edge, or Firefox.','network':'Could not reach the connection service. Check your internet connection and try again.'};
        this.leave(messages[error.type] || 'Connection failed. Try again; some networks need a TURN relay.',true);
      });
      peer.on('disconnected',()=>{if(this.generation===generation && !peer.destroyed) {try{peer.reconnect();}catch{} }});
      this.heartbeat=setInterval(()=>{
        if(this.generation!==generation || !this.conn?.open)return;
        if(this.lastHeard && performance.now()-this.lastHeard>12000){this.leave('Your friend disconnected. Create or join a room to play again.',true);return;}
        this.send({t:'ping',at:performance.now()});
      },1000);
    },
    bind(conn,generation) {
      this.conn=conn; this.lastHeard=performance.now();
      let handshake=setTimeout(()=>{if(this.generation===generation&&!this.connected)this.leave('Your friend could not connect. Try another network or a TURN relay.',true);},20000);
      conn.on('open',()=>{if(this.generation!==generation)return;this.lastHeard=performance.now();if(!this.host)this.send({t:'hello',v:VERSION});});
      conn.on('data',data=>{
        if(this.generation!==generation || this.conn!==conn)return;
        this.lastHeard=performance.now();
        if(!data || typeof data!=='object' || typeof data.t!=='string')return;
        this.receive(data); if(this.connected)clearTimeout(handshake);
      });
      const gone=()=>{clearTimeout(handshake);if(this.generation===generation && this.conn===conn)this.leave('Your friend left the room. You can create or join another one.',true);};
      conn.on('close',gone);conn.on('error',gone);
    },
    activate() {
      this.active=true;this.clock=idleClock();this.lastSnapshot=-1;this.serial=0;
      this.resetSupport();
      document.body.classList.add('bs-mp-active');this.adapter.enter(this.role,this.map);this.refresh();
    },
    send(data, expendable=false) {
      if(!this.conn?.open)return;
      if(expendable && (this.conn.bufferSize>2 || this.conn.dataChannel?.bufferedAmount>32768))return;
      try {this.conn.send(data);}catch{this.leave('The connection was interrupted. Please create or join another room.',true);}
    },
    receive(data) {
      if(data.t==='ping' && Number.isFinite(data.at)){this.send({t:'pong',at:data.at});return;}
      if(data.t==='pong' && Number.isFinite(data.at)){this.ping=Math.max(0,Math.min(9999,Math.round(performance.now()-data.at)));return;}
      if(data.t==='reject' && !this.connected){this.leave(typeof data.reason==='string'?data.reason.slice(0,180):'Room unavailable.',true);return;}
      if(this.host) {
        if(data.t==='hello' && !this.connected) {
          if(data.v!==VERSION){this.send({t:'reject',reason:'Both players need the same game version.'});return;}
          this.connected=true;this.send({t:'welcome',v:VERSION,hostRole:this.hostRole,map:this.map});this.setStatus('Friend connected. Preparing their game…');
        } else if(this.connected && data.t==='ready') {this.guestReady=true;this.setStatus('Both players are ready. Start the chase when you are ready.');}
        else if(this.connected && data.t==='input' && data.round===this.round){this.remoteInput=cleanInput(data.keys);this.remoteInputAt=performance.now();}
        else if(this.connected && data.t==='support' && data.round===this.round)this.deploySupport(data.kind,true);
        else if(this.connected && data.t==='pause')this.pause();
        else if(this.connected && data.t==='resume')this.resume();
      } else {
        if(data.t==='welcome' && !this.connected && data.v===VERSION && ROLES.includes(data.hostRole) && this.adapter.maps().some(m=>m.id===data.map)) {
          clearTimeout(this.timer);this.busy=false;this.connected=true;this.hostRole=data.hostRole;this.role=opposite(data.hostRole);this.map=data.map;this.activate();this.send({t:'ready'});this.setStatus('Connected. Waiting for the host to start.');
        } else if(this.connected && data.t==='lobby' && ROLES.includes(data.hostRole)) {
          this.hostRole=data.hostRole;this.role=opposite(data.hostRole);this.clock=idleClock();this.resetSupport();this.adapter.enter(this.role,this.map);this.setStatus('Sides swapped. Waiting for the host to start.');this.show();
        } else if(this.connected && data.t==='start' && Number.isSafeInteger(data.round) && data.round>this.round && validStates(data.states) && validClock(data.clock) && validSupport(data.support)) {
          this.round=data.round;this.clock={...data.clock};this.lastSnapshot=-1;this.resetSupport();this.adapter.enter(this.role,this.map);this.adapter.apply(data.states,true,0);this.adapter.applySupport(data.support,true);this.inputAt=0;this.inputSignature='';this.dialog.close();this.refresh();
        } else if(this.connected && data.t==='state' && data.round===this.round && Number.isSafeInteger(data.serial) && data.serial>this.lastSnapshot && validStates(data.states) && validClock(data.clock) && validSupport(data.support)) {
          const before=this.clock.phase;this.lastSnapshot=data.serial;this.clock={...data.clock};
          this.adapter.apply(data.states,this.clock.phase!=='playing',Math.min(.12,this.ping/2000));
          this.adapter.applySupport(data.support,this.clock.phase!=='playing');
          if(this.clock.phase==='finished' || this.clock.phase==='paused'){if(before!==this.clock.phase)this.show();}
          else if(before==='paused' || before==='finished')this.dialog.close();
          this.refresh();
        } else if(this.connected && data.t==='support-result' && data.round===this.round && Object.hasOwn(SUPPORT,data.kind) && typeof data.ok==='boolean' && typeof data.message==='string' && data.message.length<180) {
          if(this.pendingSupport?.kind===data.kind)this.pendingSupport=null;
          this.announceSupport(data.message);
        }
      }
    },
    startRound() {
      if(!this.host||!this.guestReady||!this.conn?.open||!['lobby','finished'].includes(this.clock.phase))return;
      this.round++;this.clock={...idleClock(),phase:'countdown'};this.remoteInput={...STOP};this.remoteInputAt=0;
      this.resetSupport();this.adapter.enter(this.role,this.map);this.send({t:'start',round:this.round,clock:this.clock,states:this.adapter.states(),support:this.adapter.supportState()});
      this.dialog.close();this.refresh();
    },
    swap() {
      if(!this.host||!['lobby','finished'].includes(this.clock.phase))return;
      this.hostRole=opposite(this.hostRole);this.role=this.hostRole;this.clock=idleClock();this.resetSupport();this.adapter.enter(this.role,this.map);
      this.send({t:'lobby',hostRole:this.hostRole});this.setStatus('Sides swapped. Ready for another chase.');
    },
    pause() {
      if(!this.active||!['playing','countdown'].includes(this.clock.phase))return;
      this.adapter.clearKeys();this.remoteInput={...STOP};
      if(this.host){this.clock.phase='paused';this.snapshot();}else{this.send({t:'pause'});this.clock.phase='paused';}
      this.setStatus('Chase paused for both players. Resume when you are both back.');this.show();
    },
    resume() {
      if(!this.active || this.clock.phase!=='paused')return;
      if(this.host) {
        if(document.hidden){this.setStatus('Return to the host’s game tab to resume.');return;}
        this.clock.phase='countdown';this.clock.countdown=3;this.remoteInput={...STOP};this.remoteInputAt=0;this.adapter.clearKeys();this.snapshot();this.dialog.close();
      } else {this.send({t:'resume'});this.setStatus('Waiting for the host’s game to resume…');}
      this.refresh();
    },
    finish(winner,reason) {this.clock.phase='finished';this.clock.winner=winner;this.clock.reason=reason;this.adapter.clearKeys();this.adapter.stop();this.snapshot();this.show();},
    resetSupport() {this.supportNotice='';this.supportNoticeUntil=0;this.pendingSupport=null;},
    announceSupport(message) {this.supportNotice=message;this.supportNoticeUntil=performance.now()+4500;this.refresh();},
    support(kind) {
      if(!this.active || !this.connected || this.role!=='cop' || this.clock.phase!=='playing' || !Object.hasOwn(SUPPORT,kind))return;
      if(this.host)this.deploySupport(kind,false);
      else {
        if(this.pendingSupport && performance.now()<this.pendingSupport.until)return;
        this.pendingSupport={kind,until:performance.now()+2000};this.send({t:'support',round:this.round,kind});this.refresh();
      }
    },
    deploySupport(kind,remote) {
      // Only the host deploys support, at the actual cars' positions in its simulation.
      if(!this.host || !this.active || !this.connected || this.clock.phase!=='playing' || !Object.hasOwn(SUPPORT,kind) || (remote?opposite(this.role):this.role)!=='cop')return;
      const result=this.adapter.deploySupport(kind);
      if(result.ok || !remote)this.announceSupport(result.message);
      if(result.ok)this.snapshot();
      if(result.ok || remote)this.send({t:'support-result',round:this.round,kind,ok:result.ok,message:result.message});
    },
    snapshot() {this.send({t:'state',round:this.round,serial:++this.serial,clock:this.clock,states:this.adapter.states(),support:this.adapter.supportState()},true);},
    tick(dt,keys) {
      if(!this.active)return;
      const now=performance.now();
      if(this.host) {
        if(this.clock.phase==='countdown') {this.clock.countdown=Math.max(0,this.clock.countdown-dt);if(!this.clock.countdown)this.clock.phase='playing';}
        else if(this.clock.phase==='playing') {
          this.adapter.simulate(dt,keys,now-this.remoteInputAt<500?this.remoteInput:STOP);
          this.clock.elapsed+=dt;
          const states=this.adapter.states(),gap=Math.hypot(states.racer.x-states.cop.x,states.racer.z-states.cop.z);
          const slow=Math.hypot(states.racer.vx,states.racer.vz)<8;
          this.clock.capture=gap<9&&slow?Math.min(3,this.clock.capture+dt):Math.max(0,this.clock.capture-dt*2);
          this.clock.escape=gap>140?Math.min(8,this.clock.escape+dt):0;
          if(this.clock.capture>=3)this.finish('cop','The racer was held close for 3 seconds.');
          else if(this.clock.escape>=8)this.finish('racer','The racer stayed more than 140 m away for 8 seconds.');
          else if(this.clock.elapsed>=180)this.finish('racer','The racer survived the full 3-minute pursuit.');
        }
        if(this.connected && now-this.lastSend>=50){this.lastSend=now;this.snapshot();}
      } else {
        if(this.clock.phase==='playing')this.adapter.predict(dt,keys);
        const input=this.clock.phase==='playing'?cleanInput(keys):STOP,signature=JSON.stringify(input);
        if(now-this.inputAt>=50 || signature!==this.inputSignature){this.inputAt=now;this.inputSignature=signature;this.send({t:'input',round:this.round,keys:input},true);}
      }
      this.adapter.render(dt,this.host);
      if(now-this.lastUI>100){this.lastUI=now;this.refresh();}
    },
    shutdown() {
      ++this.generation;clearTimeout(this.timer);clearInterval(this.heartbeat);
      const conn=this.conn,peer=this.peer;this.conn=null;this.peer=null;
      try{conn?.close();}catch{}try{peer?.destroy();}catch{}
    },
    leave(message='You left the room.',error=false) {
      const wasActive=this.active;this.shutdown();this.active=false;this.host=false;this.connected=false;this.guestReady=false;this.busy=false;this.code='';this.round=0;this.clock=idleClock();this.lastSnapshot=-1;this.ping=0;
      this.resetSupport();
      document.body.classList.remove('bs-mp-active');if(wasActive)this.adapter.leave();this.setStatus(message,error);this.show();
    },
    refresh() {
      if(!this.el)return;
      const clock=this.clock,room=this.active,ready=!!this.adapter.info().ready;
      this.el('setup').hidden=room;this.el('room').hidden=!room;this.hud.hidden=!room;
      this.el('host').disabled=this.el('join').disabled=this.busy||!ready;
      this.el('status').textContent=this.message || (!ready?'Loading game assets…':'Create a room, then share its code with your friend.');
      this.el('status').dataset.error=String(this.isError);
      this.el('code').textContent=this.code;
      const mapName=this.adapter.maps().find(m=>m.id===this.map)?.name || this.map;
      this.el('roster').textContent=`YOU: ${this.role.toUpperCase()} · FRIEND: ${this.connected?opposite(this.role).toUpperCase():'WAITING'} · ${mapName}`;
      this.el('start').hidden=!this.host||!['lobby','finished'].includes(clock.phase);this.el('start').disabled=!this.guestReady;
      this.el('start').textContent=clock.phase==='finished'?'REMATCH':'START CHASE';
      this.el('swap').hidden=!this.host||!['lobby','finished'].includes(clock.phase);
      this.el('resume').hidden=clock.phase!=='paused';
      this.el('side').textContent=`${this.role==='cop'?'COP':'RACER'} · ${this.code}`;
      this.el('support').hidden=!room||this.role!=='cop';
      const support=this.adapter.supportStatus(),pending=this.pendingSupport && performance.now()<this.pendingSupport.until;
      for(const [kind,spec] of Object.entries(SUPPORT)) {
        const button=this.el('support-'+kind),seconds=Math.ceil(support.cooldowns[kind]);
        const full=kind==='backup'?support.backup>=2:support.blocks>=3;
        const label=pending&&this.pendingSupport.kind===kind?'REQUESTED':seconds?`${seconds}s`:full?'LIMIT REACHED':'READY';
        button.querySelector('small').textContent=label;
        button.disabled=clock.phase!=='playing'||!this.connected||seconds>0||full||!!pending;
        button.setAttribute('aria-label',`${spec.name}, ${spec.key}, ${label.toLowerCase()}`);
      }
      const notice=this.el('support-notice');notice.hidden=!room||performance.now()>=this.supportNoticeUntil;
      notice.textContent=this.supportNotice;
      let title='Waiting for your friend',detail='Share the room code to connect.',progress=0;
      if(clock.phase==='lobby'&&this.connected){title=this.host?'Ready to chase':'Waiting for the host';detail='One cop vs one racer · '+mapName;}
      if(clock.phase==='countdown'){title=`${Math.max(1,Math.ceil(clock.countdown))} — Get ready`;detail=this.role==='cop'?'Stay close and stop the racer.':'Break away from the cop.';}
      if(clock.phase==='paused'){title='Chase paused';detail='Open the room menu to resume together.';}
      if(clock.phase==='playing') {
        const states=this.adapter.states(),gap=Math.round(Math.hypot(states.racer.x-states.cop.x,states.racer.z-states.cop.z));
        const time=Math.max(0,Math.ceil(180-clock.elapsed));
        title=`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')} · ${gap} m apart`;
        detail=clock.capture>0?`ARREST ${Math.round(clock.capture/3*100)}% — ${this.role==='cop'?'keep them close':'accelerate away'}`:clock.escape>0?`ESCAPE ${Math.round(clock.escape/8*100)}% — ${this.role==='cop'?'close the gap':'keep your distance'}`:this.role==='cop'?'Slow the racer and hold them within 9 m.':'Get 140 m away or survive until the timer ends.';
        if(this.ping)detail+=` · ${this.ping} ms`;
        progress=clock.capture>0?clock.capture/3:clock.escape/8;
      }
      if(clock.phase==='finished') {
        title=clock.winner===this.role?'YOU WIN':'YOUR FRIEND WINS';detail=clock.reason;
        this.el('status').textContent=title+' — '+detail+(this.host?' Play again or swap sides.':' Waiting for the host to choose a rematch.');
      }
      this.el('hud-title').textContent=title;this.el('hud-detail').textContent=detail;this.el('meter').firstElementChild.style.width=(progress*100)+'%';
    }
  };
})();
