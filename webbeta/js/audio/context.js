/**
 * context.js - Gestion du contexte audio Web Audio API
 * Équivalent de l'initialisation audio dans la version Python
 */

class AudioContextManager {
    constructor() {
        this.context = null;
        this.isInitialized = false;
        this.devices = {
            inputs: [],
            outputs: []
        };
    }

    /**
     * Initialise le contexte audio
     * @returns {Promise} Promesse résolue lorsque le contexte est initialisé
     */
    async initialize() {
        if (this.isInitialized) return Promise.resolve();

        try {
            // Création du contexte audio
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();

            // Attendre que le contexte soit complètement initialisé
            await this.context.resume();

            // Enumérer les périphériques audio disponibles
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.devices.inputs = devices.filter(device => device.kind === 'audioinput');
                this.devices.outputs = devices.filter(device => device.kind === 'audiooutput');

                console.log('Périphériques audio détectés:', {
                    inputs: this.devices.inputs.length,
                    outputs: this.devices.outputs.length
                });
            }

            this.isInitialized = true;
            console.log(`Contexte audio initialisé - ${this.context.sampleRate}Hz`);
            return Promise.resolve();
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du contexte audio:', error);
            return Promise.reject(error);
        }
    }

    /**
     * Suspend le contexte audio pour économiser les ressources
     */
    suspend() {
        if (this.context && this.isInitialized) {
            this.context.suspend();
        }
    }

    /**
     * Reprend le contexte audio
     * @returns {Promise} Promesse résolue lorsque le contexte est repris
     */
    resume() {
        if (this.context && this.isInitialized) {
            return this.context.resume();
        }
        return this.initialize();
    }
}

// Configuration audio partagée - équivalent de AudioConfig
const audioConfig = {
    // Paramètres audio
    sampleRate: 44100,
    fftSize: 256,
    minDecibels: -90,
    maxDecibels: 0,
    smoothingTimeConstant: 0.85,

    // Paramètres d'analyse
    windowType: 'hanning',
    scaleType: 'linear',
    averagingCount: 4,

    // Paramètres de bruit
    amplitude: 1,

    // Paramètres de filtres 
    filters: []
};

// Instance singleton du gestionnaire de contexte
const audioContextManager = new AudioContextManager();

// Exporter les objets pour les utiliser dans d'autres modules
window.audioContextManager = audioContextManager;
window.audioConfig = audioConfig;
