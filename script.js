/**
 * ========================================================
 * AQLLI SVITAFOR VA YO'L HARAKATI SIMULYATORI - SCRIPT.JS
 * Avtomobillar va piyodalar harakati to'liq fizikasi
 * ========================================================
 */

(function () {
  'use strict';

  // --- AUDIO SINTESIS (Web Audio API) ---
  class SoundManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playTone(freq, type, duration, gainVal = 0.08) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Audio error handling
      }
    }

    pedestrianBeep(urgent = false) {
      if (!this.enabled) return;
      const freq = urgent ? 1200 : 880;
      this.playTone(freq, 'sine', 0.09, 0.05);
    }

    buttonClick() {
      this.playTone(600, 'triangle', 0.06, 0.05);
    }

    carHorn() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [440, 550].forEach(freq => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.35);
        });
      } catch (e) {}
    }
  }

  const sound = new SoundManager();

  // --- TRAFFIC LIGHT STATES ---
  const LIGHT_STATE = {
    CAR_GREEN: 'CAR_GREEN',        // Avto yashil, Piyoda qizil
    CAR_YELLOW: 'CAR_YELLOW',      // Avto sariq, Piyoda qizil
    CAR_RED: 'CAR_RED',            // Avto qizil, Piyoda yashil
    CAR_RED_YELLOW: 'CAR_RED_YELLOW' // O'tish holati
  };

  // State Configuration
  const state = {
    isPaused: false,
    mode: 'auto', // 'auto' | 'manual'
    speedMultiplier: 1.0,
    nightMode: false,
    
    // Traffic light timing
    lightState: LIGHT_STATE.CAR_GREEN,
    timeRemaining: 10,
    carGreenDuration: 10,
    pedGreenDuration: 8,
    yellowDuration: 3,
    redYellowDuration: 2,
    
    // Pedestrian request queue
    pedestrianCallPending: false,
    pedestrianCallMinDelay: 3, // seconds before switching if button pushed

    // Statistics
    carsPassed: 0,
    pedsPassed: 0,

    // Traffic generation
    density: 'medium', // 'light' | 'medium' | 'heavy'
    carSpawnTimer: 0,
    pedSpawnTimer: 0
  };

  // --- DOM REFERENCES ---
  const DOM = {
    stage: document.getElementById('stage'),
    roadway: document.getElementById('roadway'),
    carsLayer: document.getElementById('cars-layer'),
    pedestriansLayer: document.getElementById('pedestrians-layer'),
    
    // Stats
    statCarsPassed: document.getElementById('stat-cars-passed'),
    statPedsPassed: document.getElementById('stat-peds-passed'),
    statMode: document.getElementById('stat-mode'),

    // Toolbar buttons
    btnTogglePlay: document.getElementById('btn-toggle-play'),
    btnPlayText: document.getElementById('btn-play-text'),
    btnModeToggle: document.getElementById('btn-mode-toggle'),
    modeText: document.getElementById('mode-text'),
    btnPedRequest: document.getElementById('btn-ped-request'),
    btnAddCar: document.getElementById('btn-add-car'),
    btnAddPed: document.getElementById('btn-add-ped'),
    speedRange: document.getElementById('speed-range'),
    speedLabel: document.getElementById('speed-label'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),

    // Physical Pedestrian Pole Button
    pedPhysicalBtn: document.getElementById('ped-physical-btn'),
    pedCallIndicator: document.getElementById('ped-call-indicator'),

    // Traffic Lights UI
    carTimer: document.getElementById('car-timer'),
    carBulbRed: document.getElementById('car-light-red'),
    carBulbYellow: document.getElementById('car-light-yellow'),
    carBulbGreen: document.getElementById('car-light-green'),

    pedTimer: document.getElementById('ped-timer'),
    pedBulbRed: document.getElementById('ped-light-red'),
    pedBulbGreen: document.getElementById('ped-light-green'),

    // Manual Light Buttons
    btnForceRed: document.getElementById('btn-force-red'),
    btnForceYellow: document.getElementById('btn-force-yellow'),
    btnForceGreen: document.getElementById('btn-force-green'),

    // Settings
    inputCarGreen: document.getElementById('car-green-duration'),
    inputPedGreen: document.getElementById('ped-green-duration'),
    selectDensity: document.getElementById('traffic-density'),

    // Status Message Box
    ruleBadge: document.getElementById('current-rule-badge'),
    ruleExplanation: document.getElementById('current-rule-explanation')
  };

  // --- ENTITY COLLECTIONS ---
  const cars = [];
  const pedestrians = [];

  // Vehicle Models Definition (SVG graphics)
  const CAR_TEMPLATES = [
    {
      type: 'sedan-red',
      bodyColor: '#ef4444',
      roofColor: '#b91c1c',
      windowColor: '#1e293b',
      length: 86,
      height: 42,
      name: 'Qizil Sedan'
    },
    {
      type: 'sedan-blue',
      bodyColor: '#2563eb',
      roofColor: '#1d4ed8',
      windowColor: '#0f172a',
      length: 84,
      height: 42,
      name: 'Moviy Sedan'
    },
    {
      type: 'taxi-yellow',
      bodyColor: '#facc15',
      roofColor: '#eab308',
      windowColor: '#1e293b',
      isTaxi: true,
      length: 84,
      height: 42,
      name: 'Toshkent Taksisi'
    },
    {
      type: 'sport-black',
      bodyColor: '#18181b',
      roofColor: '#27272a',
      windowColor: '#09090b',
      length: 88,
      height: 40,
      name: 'Sportkar'
    },
    {
      type: 'ev-cyan',
      bodyColor: '#06b6d4',
      roofColor: '#0891b2',
      windowColor: '#164e63',
      length: 82,
      height: 42,
      name: 'Elektromobil'
    },
    {
      type: 'city-bus',
      bodyColor: '#10b981',
      roofColor: '#059669',
      windowColor: '#064e3b',
      isBus: true,
      length: 110,
      height: 45,
      name: 'Shahar Avtobusi'
    }
  ];

  // Pedestrian Visual Themes
  const PEDESTRIAN_COLORS = [
    { shirt: '#ef4444', pants: '#1e293b', skin: '#ffdbac' },
    { shirt: '#3b82f6', pants: '#334155', skin: '#f1c27d' },
    { shirt: '#10b981', pants: '#1e293b', skin: '#e0ac69' },
    { shirt: '#a855f7', pants: '#475569', skin: '#ffdbac' },
    { shirt: '#f97316', pants: '#0f172a', skin: '#8d5524' },
    { shirt: '#ec4899', pants: '#1e293b', skin: '#f1c27d' }
  ];

  // --- CAR CLASS ---
  class Car {
    constructor(laneIndex, customType = null) {
      this.lane = laneIndex; // 0 = Eastbound (Top, L -> R), 1 = Westbound (Bottom, R -> L)
      this.template = customType || CAR_TEMPLATES[Math.floor(Math.random() * CAR_TEMPLATES.length)];
      this.width = this.template.length;
      this.height = this.template.height;

      // Road geometry
      const stageWidth = DOM.roadway.clientWidth || 980;
      this.direction = this.lane === 0 ? 1 : -1; // 1 = right, -1 = left
      
      // Position
      this.x = this.direction === 1 ? -this.width - 20 : stageWidth + 20;
      this.y = this.lane === 0 ? 34 : 154; // Vertically centered in lane

      // Speeds (pixels per frame at 60fps)
      this.maxSpeed = 2.4 + Math.random() * 0.9;
      this.speed = this.maxSpeed;
      this.acceleration = 0.08;
      this.brakingDecel = 0.16;

      this.isBraking = false;
      this.hasCrossedStopLine = false;
      this.passedCrosswalk = false;
      this.element = this.createDOMElement();

      DOM.carsLayer.appendChild(this.element);
      this.updateDOM();
    }

    createDOMElement() {
      const el = document.createElement('div');
      el.className = `car car-heading-${this.direction === 1 ? 'east' : 'west'}`;
      el.style.width = `${this.width}px`;
      el.style.height = `${this.height}px`;

      // SVG Car Graphic
      const isEast = this.direction === 1;
      const t = this.template;

      el.innerHTML = `
        <div class="car-headlights"></div>
        <div class="car-brake-light brake-top"></div>
        <div class="car-brake-light brake-bottom"></div>
        <svg class="car-svg" viewBox="0 0 ${this.width} ${this.height}">
          <!-- Wheels -->
          <rect x="${isEast ? 12 : this.width - 24}" y="0" width="14" height="6" rx="2" fill="#09090b"/>
          <rect x="${isEast ? this.width - 26 : 10}" y="0" width="14" height="6" rx="2" fill="#09090b"/>
          <rect x="${isEast ? 12 : this.width - 24}" y="${this.height - 6}" width="14" height="6" rx="2" fill="#09090b"/>
          <rect x="${isEast ? this.width - 26 : 10}" y="${this.height - 6}" width="14" height="6" rx="2" fill="#09090b"/>
          
          <!-- Car Body Shell -->
          <rect x="4" y="5" width="${this.width - 8}" height="${this.height - 10}" rx="9" fill="${t.bodyColor}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
          
          <!-- Windshields & Windows -->
          ${isEast ? `
            <!-- Eastbound (Moving Right) -->
            <path d="M 24 10 L ${this.width - 28} 10 Q ${this.width - 16} 12 ${this.width - 16} 21 Q ${this.width - 16} 30 ${this.width - 28} 32 L 24 32 Q 18 30 18 21 Q 18 12 24 10 Z" fill="${t.windowColor}"/>
            <!-- Roof -->
            <rect x="28" y="11" width="${this.width - 50}" height="20" rx="4" fill="${t.roofColor}"/>
          ` : `
            <!-- Westbound (Moving Left) -->
            <path d="M ${this.width - 24} 10 L 28 10 Q 16 12 16 21 Q 16 30 28 32 L ${this.width - 24} 32 Q ${this.width - 18} 30 ${this.width - 18} 21 Q ${this.width - 18} 12 ${this.width - 24} 10 Z" fill="${t.windowColor}"/>
            <!-- Roof -->
            <rect x="22" y="11" width="${this.width - 50}" height="20" rx="4" fill="${t.roofColor}"/>
          `}

          <!-- Taxi Checker Sign -->
          ${t.isTaxi ? `
            <rect x="${this.width/2 - 10}" y="${this.height/2 - 4}" width="20" height="8" rx="2" fill="#ffffff" stroke="#000" stroke-width="0.8"/>
            <text x="${this.width/2}" y="${this.height/2 + 2.5}" font-size="6" font-weight="900" text-anchor="middle" fill="#000">TAXI</text>
          ` : ''}

          <!-- Headlights -->
          <circle cx="${isEast ? this.width - 5 : 5}" cy="10" r="3" fill="#fef08a"/>
          <circle cx="${isEast ? this.width - 5 : 5}" cy="${this.height - 10}" r="3" fill="#fef08a"/>
        </svg>
      `;

      // Click on car to honk
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.carHorn();
        el.style.transform = `translate(${this.x}px, ${this.y}px) scale(1.08)`;
        setTimeout(() => {
          el.style.transform = `translate(${this.x}px, ${this.y}px) scale(1)`;
        }, 150);
      });

      return el;
    }

    update(deltaFactor) {
      const stageWidth = DOM.roadway.clientWidth || 980;
      const stopLineLeft = stageWidth * 0.5 - 95;
      const stopLineRight = stageWidth * 0.5 + 90;

      // Check if front of car has passed stop line
      const frontX = this.direction === 1 ? (this.x + this.width) : this.x;
      if (this.direction === 1 && frontX > stopLineLeft) {
        this.hasCrossedStopLine = true;
      } else if (this.direction === -1 && frontX < stopLineRight) {
        this.hasCrossedStopLine = true;
      }

      // 1. Check Traffic Light rules
      let shouldStopForLight = false;
      const isRedOrYellow = (state.lightState === LIGHT_STATE.CAR_RED ||
                             state.lightState === LIGHT_STATE.CAR_YELLOW ||
                             state.lightState === LIGHT_STATE.CAR_RED_YELLOW);

      if (isRedOrYellow && !this.hasCrossedStopLine) {
        if (this.direction === 1) {
          // Eastbound (Left to Right)
          const distToStop = stopLineLeft - (this.x + this.width);
          if (distToStop > -10 && distToStop < 210) {
            shouldStopForLight = true;
          }
        } else {
          // Westbound (Right to Left)
          const distToStop = this.x - stopLineRight;
          if (distToStop > -10 && distToStop < 210) {
            shouldStopForLight = true;
          }
        }
      }

      // 2. Pedestrian safety rule: If pedestrian is currently crossing this car's lane on the crosswalk!
      let pedestrianBlocking = false;
      const crosswalkLeft = stageWidth * 0.5 - 65;
      const crosswalkRight = stageWidth * 0.5 + 65;

      // Check distance to crosswalk
      const isNearCrosswalk = (this.direction === 1 && this.x + this.width >= crosswalkLeft - 80 && this.x <= crosswalkRight) ||
                              (this.direction === -1 && this.x <= crosswalkRight + 80 && this.x + this.width >= crosswalkLeft);

      if (isNearCrosswalk) {
        for (const ped of pedestrians) {
          // Check if pedestrian is inside road and near this car's lane
          const pedInLane = (this.lane === 0 && ped.y >= 0 && ped.y <= 130) ||
                            (this.lane === 1 && ped.y >= 110 && ped.y <= 240);

          if (pedInLane && ped.isCrossing) {
            pedestrianBlocking = true;
            break;
          }
        }
      }

      // 3. Collision avoidance with car in front (same lane)
      let carAhead = null;
      let minDistanceToCar = 99999;

      for (const other of cars) {
        if (other === this || other.lane !== this.lane) continue;

        if (this.direction === 1) {
          // Eastbound
          const gap = other.x - (this.x + this.width);
          if (gap >= 0 && gap < minDistanceToCar) {
            minDistanceToCar = gap;
            carAhead = other;
          }
        } else {
          // Westbound
          const gap = this.x - (other.x + other.width);
          if (gap >= 0 && gap < minDistanceToCar) {
            minDistanceToCar = gap;
            carAhead = other;
          }
        }
      }

      // Decide target speed
      let targetSpeed = this.maxSpeed;

      if (shouldStopForLight || pedestrianBlocking) {
        targetSpeed = 0;
      }

      if (carAhead && minDistanceToCar < 120) {
        if (minDistanceToCar < 42) {
          targetSpeed = 0;
        } else {
          targetSpeed = Math.min(targetSpeed, carAhead.speed * (minDistanceToCar / 100));
        }
      }

      // Apply acceleration / deceleration
      if (this.speed < targetSpeed) {
        this.speed = Math.min(targetSpeed, this.speed + this.acceleration * deltaFactor);
        this.isBraking = false;
      } else if (this.speed > targetSpeed) {
        this.speed = Math.max(targetSpeed, this.speed - this.brakingDecel * deltaFactor);
        this.isBraking = this.speed > 0.2;
      } else {
        this.isBraking = false;
      }

      // Update position
      this.x += this.direction * this.speed * deltaFactor * state.speedMultiplier;

      // Count stats once passed zebra
      if (!this.passedCrosswalk) {
        if ((this.direction === 1 && this.x > crosswalkRight) ||
            (this.direction === -1 && this.x + this.width < crosswalkLeft)) {
          this.passedCrosswalk = true;
          state.carsPassed++;
          DOM.statCarsPassed.textContent = state.carsPassed;
        }
      }

      this.updateDOM();
    }

    updateDOM() {
      this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
      if (this.isBraking) {
        this.element.classList.add('braking');
      } else {
        this.element.classList.remove('braking');
      }
    }

    isOffscreen() {
      const stageWidth = DOM.roadway.clientWidth || 980;
      if (this.direction === 1) {
        return this.x > stageWidth + 120;
      } else {
        return this.x + this.width < -120;
      }
    }

    destroy() {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }

  // --- PEDESTRIAN CLASS ---
  class Pedestrian {
    constructor(startZone = null) {
      // startZone: 0 = Top sidewalk heading South, 1 = Bottom sidewalk heading North
      this.startZone = (startZone !== null) ? startZone : (Math.random() > 0.5 ? 0 : 1);
      this.colors = PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)];

      const stageWidth = DOM.roadway.clientWidth || 980;
      const zebraCenterX = stageWidth * 0.5;

      // Pedestrian jitter within zebra width (130px)
      const jitterX = -45 + Math.random() * 90;
      this.x = zebraCenterX + jitterX;

      // Y positions relative to roadway (Roadway height: 240px, top sidewalk: y < 0, bottom sidewalk: y > 240)
      if (this.startZone === 0) {
        // From Top sidewalk to Bottom
        this.y = -45 - Math.random() * 25;
        this.targetY = 285 + Math.random() * 20;
        this.waitingY = -12 - Math.random() * 20; // Natural spread on top sidewalk
        this.directionY = 1;
      } else {
        // From Bottom sidewalk to Top
        this.y = 285 + Math.random() * 25;
        this.targetY = -45 - Math.random() * 20;
        this.waitingY = 246 + Math.random() * 20; // Natural spread on bottom sidewalk
        this.directionY = -1;
      }

      this.speed = 1.1 + Math.random() * 0.4;
      this.isWaiting = false;
      this.isCrossing = false;
      this.hasCompletedCrossing = false;

      this.element = this.createDOMElement();
      DOM.pedestriansLayer.appendChild(this.element);
      this.updateDOM();
    }

    createDOMElement() {
      const el = document.createElement('div');
      el.className = 'pedestrian walking';
      el.innerHTML = `
        <div class="ped-bubble">Piyoda</div>
        <div class="ped-head" style="background: ${this.colors.skin};"></div>
        <div class="ped-torso" style="background: ${this.colors.shirt};"></div>
        <div class="ped-legs">
          <div class="ped-leg leg-left" style="background: ${this.colors.pants};"></div>
          <div class="ped-leg leg-right" style="background: ${this.colors.pants};"></div>
        </div>
      `;
      return el;
    }

    update(deltaFactor) {
      const isPedGreen = (state.lightState === LIGHT_STATE.CAR_RED);

      // Check if at the curb/waiting line
      const reachedWaitingSpot = this.directionY === 1 
        ? (this.y >= this.waitingY) 
        : (this.y <= this.waitingY);

      if (!this.hasCompletedCrossing) {
        if (!isPedGreen && !this.isCrossing) {
          // Light is RED for pedestrians
          if (reachedWaitingSpot) {
            this.isWaiting = true;
            this.element.classList.remove('walking');
            this.updateDOM();
            return;
          }
        } else {
          // Light is GREEN, or pedestrian was already in middle of road!
          this.isWaiting = false;
          this.isCrossing = true;
          this.element.classList.add('walking');
        }
      }

      // Move pedestrian
      this.y += this.directionY * this.speed * deltaFactor * state.speedMultiplier;

      // Check crossing completion
      const reachedDestination = this.directionY === 1
        ? (this.y >= 250)
        : (this.y <= -15);

      if (reachedDestination && !this.hasCompletedCrossing) {
        this.hasCompletedCrossing = true;
        this.isCrossing = false;
        state.pedsPassed++;
        DOM.statPedsPassed.textContent = state.pedsPassed;
      }

      this.updateDOM();
    }

    updateDOM() {
      this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
    }

    isFinished() {
      if (this.directionY === 1) {
        return this.y > this.targetY;
      } else {
        return this.y < this.targetY;
      }
    }

    destroy() {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }

  // --- TRAFFIC LIGHT CONTROLLER ---
  function setTrafficLightState(newState, duration = null) {
    state.lightState = newState;

    // Reset bulb visual classes
    [DOM.carBulbRed, DOM.carBulbYellow, DOM.carBulbGreen].forEach(b => b.classList.remove('active'));
    [DOM.pedBulbRed, DOM.pedBulbGreen].forEach(b => b.classList.remove('active'));
    [DOM.btnForceRed, DOM.btnForceYellow, DOM.btnForceGreen].forEach(b => b.classList.remove('active-phase'));

    // Reset timer classes
    DOM.carTimer.className = 'tl-timer';
    DOM.pedTimer.className = 'tl-timer';

    switch (newState) {
      case LIGHT_STATE.CAR_GREEN:
        // Car GREEN, Ped RED
        DOM.carBulbGreen.classList.add('active');
        DOM.pedBulbRed.classList.add('active');
        DOM.carTimer.classList.add('timer-green');
        DOM.pedTimer.classList.add('timer-red');
        DOM.btnForceGreen.classList.add('active-phase');
        state.timeRemaining = duration || state.carGreenDuration;

        updateRulesInfo(
          'status-pill-green',
          'AVTO YASHIL (Piyoda Qizil)',
          'Avtomobillar yo\'l bo\'ylab to\'xtamasdan harakatlanadi. Piyodalar qatnov qismiga chiqmasdan trotuarda kutishadi.'
        );
        break;

      case LIGHT_STATE.CAR_YELLOW:
        // Car YELLOW, Ped RED
        DOM.carBulbYellow.classList.add('active');
        DOM.pedBulbRed.classList.add('active');
        DOM.carTimer.classList.add('timer-yellow');
        DOM.pedTimer.classList.add('timer-red');
        DOM.btnForceYellow.classList.add('active-phase');
        state.timeRemaining = duration || state.yellowDuration;

        updateRulesInfo(
          'status-pill-yellow',
          'OGOHLANTIRISH (Sariq chiroq)',
          'Sariq chiroq yondi! Yaqinlashayotgan avtomobillar to\'xtash chizig\'ida (STOP) sekin to\'xtashi kerak. Piyodalar hali kutmoqda.'
        );
        break;

      case LIGHT_STATE.CAR_RED:
        // Car RED, Ped GREEN
        DOM.carBulbRed.classList.add('active');
        DOM.pedBulbGreen.classList.add('active');
        DOM.carTimer.classList.add('timer-red');
        DOM.pedTimer.classList.add('timer-green');
        DOM.btnForceRed.classList.add('active-phase');
        state.timeRemaining = duration || state.pedGreenDuration;

        // Reset pedestrian button light
        state.pedestrianCallPending = false;
        DOM.pedCallIndicator.classList.remove('active');
        DOM.pedCallIndicator.textContent = 'KUTING';

        updateRulesInfo(
          'status-pill-red',
          'PIYODA YASHIL (Avto Qizil)',
          'Avtomobillar to\'liq STOP chizig\'ida to\'xtaydi! Piyodalar zebra yo\'lagi bo\'ylab xavfsiz o\'tishlari mumkin.'
        );
        break;

      case LIGHT_STATE.CAR_RED_YELLOW:
        // Car RED+YELLOW, Ped RED
        DOM.carBulbRed.classList.add('active');
        DOM.carBulbYellow.classList.add('active');
        DOM.pedBulbRed.classList.add('active');
        DOM.carTimer.classList.add('timer-yellow');
        DOM.pedTimer.classList.add('timer-red');
        state.timeRemaining = duration || state.redYellowDuration;

        updateRulesInfo(
          'status-pill-yellow',
          'TAYYORGARLIK (Qizil + Sariq)',
          'Avtomobillar harakatga tayyorlanmoqda. Piyodalar o\'tish yo\'lagini zudlik bilan bo\'shatishi kerak.'
        );
        break;
    }

    updateTimerDisplays();
  }

  function updateRulesInfo(pillClass, titleText, explanationText) {
    DOM.ruleBadge.className = `status-pill ${pillClass}`;
    DOM.ruleBadge.textContent = titleText;
    DOM.ruleExplanation.textContent = explanationText;
  }

  function updateTimerDisplays() {
    if (state.mode === 'manual') {
      DOM.carTimer.textContent = '--';
      DOM.pedTimer.textContent = '--';
      return;
    }
    const formatted = Math.max(0, Math.ceil(state.timeRemaining));
    DOM.carTimer.textContent = formatted < 10 ? `0${formatted}` : formatted;
    DOM.pedTimer.textContent = formatted < 10 ? `0${formatted}` : formatted;
  }

  // Request Pedestrian Crossing Button Handler
  function requestPedestrianCrossing() {
    sound.buttonClick();

    if (state.lightState === LIGHT_STATE.CAR_RED) {
      // Already green for pedestrians!
      return;
    }

    state.pedestrianCallPending = true;
    DOM.pedCallIndicator.classList.add('active');
    DOM.pedCallIndicator.textContent = 'KUTING...';

    if (state.mode === 'manual') {
      // In manual mode, transition smoothly through yellow to pedestrian green
      setTrafficLightState(LIGHT_STATE.CAR_YELLOW, 2);
      setTimeout(() => {
        setTrafficLightState(LIGHT_STATE.CAR_RED, state.pedGreenDuration);
      }, 2000);
      return;
    }

    // If currently car green and countdown has lots of time left, accelerate transition!
    if (state.lightState === LIGHT_STATE.CAR_GREEN && state.timeRemaining > 3) {
      state.timeRemaining = 3; // Switch to yellow in 3 seconds
    }
  }

  // --- TRAFFIC GENERATOR ---
  function spawnCar(lane = null) {
    const targetLane = (lane !== null) ? lane : (Math.random() > 0.5 ? 0 : 1);
    
    // Ensure no overlapping car at spawn edge
    const stageWidth = DOM.roadway.clientWidth || 980;
    const isEast = targetLane === 0;
    const spawnX = isEast ? -120 : stageWidth + 120;

    const carTooClose = cars.some(c => {
      if (c.lane !== targetLane) return false;
      return Math.abs(c.x - spawnX) < 140;
    });

    if (!carTooClose) {
      cars.push(new Car(targetLane));
    }
  }

  function spawnPedestrian(zone = null) {
    pedestrians.push(new Pedestrian(zone));
  }

  // Density Interval configuration
  function getSpawnIntervals() {
    switch (state.density) {
      case 'light':
        return { car: 240, ped: 280 };
      case 'heavy':
        return { car: 80, ped: 110 };
      case 'medium':
      default:
        return { car: 140, ped: 170 };
    }
  }

  // --- MAIN SIMULATION LOOP (60 FPS) ---
  let lastTime = performance.now();
  let timerAccumulator = 0;
  let pedAudioAccumulator = 0;

  function simulationStep(now) {
    const deltaMs = Math.min(now - lastTime, 100);
    lastTime = now;

    if (!state.isPaused) {
      const deltaFactor = deltaMs / 16.666; // 1.0 at 60fps

      // 1. Countdown timer logic (seconds-based)
      timerAccumulator += (deltaMs / 1000) * state.speedMultiplier;
      if (timerAccumulator >= 1.0) {
        timerAccumulator -= 1.0;

        if (state.mode === 'auto') {
          state.timeRemaining -= 1;

          // Audio beep for pedestrians when their light is GREEN
          if (state.lightState === LIGHT_STATE.CAR_RED) {
            sound.pedestrianBeep(state.timeRemaining <= 3);
          }

          if (state.timeRemaining <= 0) {
            // Cycle transition
            switch (state.lightState) {
              case LIGHT_STATE.CAR_GREEN:
                setTrafficLightState(LIGHT_STATE.CAR_YELLOW);
                break;
              case LIGHT_STATE.CAR_YELLOW:
                setTrafficLightState(LIGHT_STATE.CAR_RED);
                break;
              case LIGHT_STATE.CAR_RED:
                setTrafficLightState(LIGHT_STATE.CAR_RED_YELLOW);
                break;
              case LIGHT_STATE.CAR_RED_YELLOW:
                setTrafficLightState(LIGHT_STATE.CAR_GREEN);
                break;
            }
          } else {
            updateTimerDisplays();
          }
        } else {
          // Manual mode: countdown timer simply holds or counts down if set
          updateTimerDisplays();
        }
      }

      // 2. Continuous Pedestrian audio beep timing when green
      if (state.lightState === LIGHT_STATE.CAR_RED) {
        pedAudioAccumulator += deltaMs;
        const interval = state.timeRemaining <= 3 ? 350 : 800;
        if (pedAudioAccumulator >= interval) {
          pedAudioAccumulator = 0;
          sound.pedestrianBeep(state.timeRemaining <= 3);
        }
      }

      // 3. Traffic generator ticks
      const intervals = getSpawnIntervals();
      state.carSpawnTimer += deltaFactor * state.speedMultiplier;
      if (state.carSpawnTimer >= intervals.car) {
        state.carSpawnTimer = 0;
        spawnCar();
      }

      state.pedSpawnTimer += deltaFactor * state.speedMultiplier;
      if (state.pedSpawnTimer >= intervals.ped) {
        state.pedSpawnTimer = 0;
        spawnPedestrian();
      }

      // 4. Update Cars
      for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        car.update(deltaFactor);
        if (car.isOffscreen()) {
          car.destroy();
          cars.splice(i, 1);
        }
      }

      // 5. Update Pedestrians
      for (let i = pedestrians.length - 1; i >= 0; i--) {
        const ped = pedestrians[i];
        ped.update(deltaFactor);
        if (ped.isFinished()) {
          ped.destroy();
          pedestrians.splice(i, 1);
        }
      }
    }

    requestAnimationFrame(simulationStep);
  }

  // --- INITIAL SEEDING ---
  function seedInitialEntities() {
    // Spawn 2 initial cars
    const c1 = new Car(0);
    c1.x = 80;
    c1.updateDOM();
    cars.push(c1);

    const c2 = new Car(1);
    c2.x = 720;
    c2.updateDOM();
    cars.push(c2);

    // Spawn 2 initial pedestrians waiting at sidewalks
    const p1 = new Pedestrian(0);
    p1.y = -10;
    p1.updateDOM();
    pedestrians.push(p1);

    const p2 = new Pedestrian(1);
    p2.y = 250;
    p2.updateDOM();
    pedestrians.push(p2);
  }

  // --- EVENT LISTENERS & UI CONTROLS ---
  function setupEventListeners() {
    // Play / Pause
    DOM.btnTogglePlay.addEventListener('click', () => {
      sound.buttonClick();
      state.isPaused = !state.isPaused;
      DOM.btnPlayText.textContent = state.isPaused ? "Davom etish" : "Pauza";
      DOM.btnTogglePlay.querySelector('.btn-icon').textContent = state.isPaused ? "▶️" : "⏸️";
    });

    // Auto / Manual Mode Toggle
    DOM.btnModeToggle.addEventListener('click', () => {
      sound.buttonClick();
      state.mode = state.mode === 'auto' ? 'manual' : 'auto';
      DOM.statMode.textContent = state.mode === 'auto' ? 'Avtomatik' : 'Qo\'lda';
      DOM.modeText.textContent = state.mode === 'auto' ? 'Qo\'lda boshqarish' : 'Avtomatik rejim';
      updateTimerDisplays();
    });

    // Pedestrian Request Buttons
    DOM.btnPedRequest.addEventListener('click', requestPedestrianCrossing);
    DOM.pedPhysicalBtn.addEventListener('click', requestPedestrianCrossing);

    // Manual Force Light Buttons
    DOM.btnForceRed.addEventListener('click', () => {
      sound.buttonClick();
      state.mode = 'manual';
      DOM.statMode.textContent = 'Qo\'lda';
      DOM.modeText.textContent = 'Avtomatik rejim';
      setTrafficLightState(LIGHT_STATE.CAR_RED, state.pedGreenDuration);
    });

    DOM.btnForceYellow.addEventListener('click', () => {
      sound.buttonClick();
      state.mode = 'manual';
      DOM.statMode.textContent = 'Qo\'lda';
      DOM.modeText.textContent = 'Avtomatik rejim';
      setTrafficLightState(LIGHT_STATE.CAR_YELLOW, state.yellowDuration);
    });

    DOM.btnForceGreen.addEventListener('click', () => {
      sound.buttonClick();
      state.mode = 'manual';
      DOM.statMode.textContent = 'Qo\'lda';
      DOM.modeText.textContent = 'Avtomatik rejim';
      setTrafficLightState(LIGHT_STATE.CAR_GREEN, state.carGreenDuration);
    });

    // Add Car manually
    DOM.btnAddCar.addEventListener('click', () => {
      sound.buttonClick();
      spawnCar();
    });

    // Add Pedestrian manually
    DOM.btnAddPed.addEventListener('click', () => {
      sound.buttonClick();
      spawnPedestrian();
    });

    // Speed Slider
    DOM.speedRange.addEventListener('input', (e) => {
      state.speedMultiplier = parseFloat(e.target.value);
      DOM.speedLabel.textContent = `${state.speedMultiplier.toFixed(1)}x`;
    });

    // Day / Night Theme Toggle
    DOM.btnThemeToggle.addEventListener('click', () => {
      sound.buttonClick();
      state.nightMode = !state.nightMode;
      document.body.classList.toggle('night-mode', state.nightMode);
      DOM.btnThemeToggle.textContent = state.nightMode ? '☀️' : '🌙';
    });

    // Sound Mute Toggle
    DOM.btnSoundToggle.addEventListener('click', () => {
      sound.enabled = !sound.enabled;
      DOM.btnSoundToggle.textContent = sound.enabled ? '🔊' : '🔇';
      if (sound.enabled) sound.buttonClick();
    });

    // Settings Inputs
    DOM.inputCarGreen.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 5 && val <= 60) {
        state.carGreenDuration = val;
      }
    });

    DOM.inputPedGreen.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 5 && val <= 60) {
        state.pedGreenDuration = val;
      }
    });

    DOM.selectDensity.addEventListener('change', (e) => {
      state.density = e.target.value;
    });

    // Handle window resize dynamically to adjust stop lines
    window.addEventListener('resize', () => {
      // Elements update their relative positions automatically
    });
  }

  // --- INITIALIZATION ---
  function init() {
    setupEventListeners();
    setTrafficLightState(LIGHT_STATE.CAR_GREEN, state.carGreenDuration);
    seedInitialEntities();
    requestAnimationFrame(simulationStep);
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
